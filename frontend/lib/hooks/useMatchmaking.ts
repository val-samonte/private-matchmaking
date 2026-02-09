"use client";

import { useCallback, useState, useRef } from "react";
import { useAtomValue } from "jotai";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { connectionAtom } from "@/lib/atoms/program";
import { Connection, PublicKey } from "@solana/web3.js";
import { MatchmakingPlayer, MatchmakingAdmin } from "@1upmonster/duel";
import { useWalletContext } from "@/lib/contexts/WalletContext";
import { getTeeAuthToken, createTeeProvider, waitForDelegation, createL1Provider } from "@/lib/utils/tee";
import { deriveQueuePda, deriveTenantPda } from "@/lib/utils/pda";
import { deriveTicketPda } from "@/lib/utils/pda";
import {
  DUEL_PROGRAM_ID,
  RPS_GAME_PROGRAM_ID,
  QUEUE_AUTHORITY,
  TEE_RPC_URL,
  TEE_WS_URL,
  ER_VALIDATOR,
  RPC_ENDPOINTS,
  SOLANA_NETWORK,
} from "@/lib/constants";

type MatchmakingState = "idle" | "creating_ticket" | "delegating" | "joining" | "searching" | "matched" | "error";

type MatchResult = {
  opponent: string;
  matchId: string;
  role: "player1" | "player2";
};

export function useMatchmaking() {
  const { publicKey, anchorWallet } = useWalletContext();
  const profilePda = useAtomValue(playerProfilePdaAtom);

  const [state, setState] = useState<MatchmakingState>("idle");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const subscriptionRef = useRef<number | null>(null);

  const findMatch = useCallback(async () => {
    if (!publicKey || !profilePda || !anchorWallet) {
      throw new Error("Wallet not connected or profile not found");
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setError(null);

      // Derive PDAs
      const [tenantPda] = deriveTenantPda(QUEUE_AUTHORITY);
      const [queuePda] = deriveQueuePda(QUEUE_AUTHORITY);

      // Create L1 provider + SDK player
      const l1Connection = new Connection(
        RPC_ENDPOINTS[SOLANA_NETWORK as keyof typeof RPC_ENDPOINTS] || RPC_ENDPOINTS.devnet,
        "confirmed"
      );
      const l1Provider = createL1Provider(l1Connection, anchorWallet);
      const l1Player = new MatchmakingPlayer(l1Provider, DUEL_PROGRAM_ID);

      // Get ticket PDA from SDK
      const ticketPda = l1Player.getTicketPda(publicKey, tenantPda);

      // 1. Clean up any stale ticket, then create a fresh MatchTicket
      setState("creating_ticket");
      const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
      const existingTicket = await l1Connection.getAccountInfo(ticketPda);

      if (existingTicket) {
        if (existingTicket.owner.equals(DELEGATION_PROGRAM_ID)) {
          // Ticket is still delegated to TEE — cancel on TEE, commit back, then close
          console.log("Stale ticket is delegated — cleaning up via TEE…");
          const { token: cleanupToken } = await getTeeAuthToken(TEE_RPC_URL, anchorWallet);
          const cleanupTeeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, cleanupToken, anchorWallet);
          const teePlayer = new MatchmakingPlayer(cleanupTeeProvider, DUEL_PROGRAM_ID);
          const teeAdmin = new MatchmakingAdmin(cleanupTeeProvider, DUEL_PROGRAM_ID);

          try { await teePlayer.cancelTicket(tenantPda); } catch (e: any) {
            console.warn("cancelTicket on TEE failed (may already be cancelled):", e.message);
          }
          try { await teeAdmin.commitTickets(tenantPda, [ticketPda]); } catch (e: any) {
            console.warn("commitTickets on TEE failed:", e.message);
          }

          // Wait for L1 to see the undelegated ticket
          console.log("Waiting for ticket to return to L1…");
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const info = await l1Connection.getAccountInfo(ticketPda);
            if (!info || !info.owner.equals(DELEGATION_PROGRAM_ID)) break;
          }
        }

        // Ticket should now be on L1 (or closed) — close it if still present
        const ticketAfterCommit = await l1Connection.getAccountInfo(ticketPda);
        if (ticketAfterCommit && !ticketAfterCommit.owner.equals(DELEGATION_PROGRAM_ID)) {
          console.log("Closing stale ticket on L1…");
          await l1Player.closeTicket(tenantPda);
        }
      }

      console.log("Creating MatchTicket on L1...");
      await l1Player.createTicket(tenantPda);
      console.log("Ticket created:", ticketPda.toBase58());

      if (signal.aborted) throw new Error("Search cancelled");

      // 2. Delegate ticket to TEE
      setState("delegating");
      console.log("Delegating ticket to TEE...");
      await l1Player.delegateTicket(publicKey, tenantPda, ER_VALIDATOR);

      // 3. Get TEE auth token
      console.log("Authenticating with TEE...");
      const { token } = await getTeeAuthToken(TEE_RPC_URL, anchorWallet);

      // Wait for delegation to activate
      console.log("Waiting for ticket TEE activation...");
      await waitForDelegation(TEE_RPC_URL, token, ticketPda);

      if (signal.aborted) throw new Error("Search cancelled");

      // 4. Join queue via TEE directly
      setState("joining");
      console.log("Joining queue via TEE...");
      const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, anchorWallet);
      const teePlayer = new MatchmakingPlayer(teeProvider, DUEL_PROGRAM_ID);

      await teePlayer.joinQueue(queuePda, tenantPda, profilePda);
      console.log("Joined queue via TEE");

      if (signal.aborted) throw new Error("Search cancelled");

      // 5. Flush pending matches + commit tickets (crank duty)
      //    After joinQueue, if we caused a match, the queue has PendingMatch
      //    entries for the opponent. We flush them and commit all tickets to L1.
      const teeAdmin = new MatchmakingAdmin(teeProvider, DUEL_PROGRAM_ID);
      try {
        const queueData = await teeAdmin.getQueue(queuePda);
        const pendingMatches = queueData.pendingMatches || [];
        console.log("Pending matches in queue:", pendingMatches.length);

        if (pendingMatches.length > 0) {
          // Derive opponent ticket PDAs from pending matches
          const opponentTicketPdas = pendingMatches.map((pm: any) =>
            deriveTicketPda(pm.player, tenantPda, DUEL_PROGRAM_ID)[0]
          );

          // Check if tenant has callback configured
          const tenantData = await teeAdmin.getTenant(tenantPda);
          const callbackProgram = tenantData.callbackProgramId || undefined;

          console.log("Flushing pending matches...");
          await teeAdmin.flushMatches(
            queuePda,
            tenantPda,
            opponentTicketPdas,
            callbackProgram,
          );
          console.log("Pending matches flushed");

          // Commit all matched tickets (ours + opponents) back to L1
          const allTickets = [ticketPda, ...opponentTicketPdas];
          console.log("Committing tickets to L1...", allTickets.map(t => t.toBase58()));
          await teeAdmin.commitTickets(tenantPda, allTickets);
          console.log("Tickets committed to L1");
        } else {
          // We're the first player — no match yet, just wait
          console.log("No pending matches — waiting for opponent to join and flush");
        }
      } catch (flushErr: any) {
        // Non-fatal: the other player may handle flush+commit
        console.warn("Flush/commit failed (other player may handle it):", flushErr.message);
      }

      if (signal.aborted) throw new Error("Search cancelled");

      // 6. Subscribe to ticket PDA on L1 via onAccountChange
      setState("searching");
      console.log("Waiting for match (watching L1 ticket)...");

      const match = await new Promise<MatchResult | null>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        let pollId: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (pollId) clearInterval(pollId);
          if (subscriptionRef.current !== null) {
            l1Connection.removeAccountChangeListener(subscriptionRef.current);
            subscriptionRef.current = null;
          }
        };

        // Listen for abort
        signal.addEventListener("abort", () => {
          cleanup();
          resolve(null);
        });

        // Timeout after 2 minutes
        timeoutId = setTimeout(() => {
          cleanup();
          resolve(null);
        }, 120000);

        const tryDecode = (accountInfo: { data: Buffer }) => {
          try {
            const decoded = l1Player.program.coder.accounts.decode(
              "matchTicket",
              accountInfo.data
            );
            if (decoded.status?.matched) {
              cleanup();
              const opponentKey = decoded.status.matched.opponent;
              const opponentStr = opponentKey.toBase58();
              const myKey = publicKey.toBuffer();
              const oppKey = new PublicKey(opponentStr).toBuffer();
              const role = Buffer.compare(myKey, oppKey) < 0 ? "player1" : "player2";
              resolve({
                opponent: opponentStr,
                matchId: decoded.status.matched.matchId.toString(),
                role,
              });
              return true;
            }
          } catch (e) {
            // Ignore decode errors during transition
          }
          return false;
        };

        // Subscribe to L1 account changes
        subscriptionRef.current = l1Connection.onAccountChange(
          ticketPda,
          (accountInfo) => tryDecode(accountInfo),
          "confirmed"
        );

        // Poll L1 every 3s as fallback (websocket can be unreliable on devnet)
        const pollL1 = async () => {
          try {
            const info = await l1Connection.getAccountInfo(ticketPda);
            if (info && info.owner.toBase58() !== "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh") {
              tryDecode(info);
            }
          } catch {}
        };
        // Immediate check + periodic poll
        pollL1();
        pollId = setInterval(pollL1, 3000);
      });

      if (match) {
        setMatchResult(match);
        setState("matched");
        console.log("Match found!", match);
        return match;
      } else if (signal.aborted) {
        setState("idle");
        return null;
      } else {
        throw new Error("Match search timed out");
      }
    } catch (err: any) {
      if (err.message === "Search cancelled") {
        console.log("Match search cancelled by user");
        setState("idle");
        return null;
      }
      console.error("Matchmaking error:", err);
      setError(err.message || "Failed to find match");
      setState("error");
      throw err;
    }
  }, [publicKey, profilePda, anchorWallet]);

  const cancelSearch = useCallback(() => {
    setState("idle");
    setMatchResult(null);
    if (subscriptionRef.current !== null) {
      subscriptionRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log("Cancelling match search...");
    }

    // Best-effort on-chain cancel (fire-and-forget)
    if (publicKey && anchorWallet) {
      const [tenantPda] = deriveTenantPda(QUEUE_AUTHORITY);
      getTeeAuthToken(TEE_RPC_URL, anchorWallet)
        .then(({ token }) => {
          const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, anchorWallet);
          const teePlayer = new MatchmakingPlayer(teeProvider, DUEL_PROGRAM_ID);
          return teePlayer.cancelTicket(tenantPda);
        })
        .then(() => console.log("Ticket cancelled on-chain"))
        .catch((err) => console.warn("Failed to cancel ticket on-chain (best-effort):", err));
    }
  }, [publicKey, anchorWallet]);

  const reset = useCallback(() => {
    setState("idle");
    setMatchResult(null);
  }, []);

  return {
    findMatch,
    cancelSearch,
    state,
    matchResult,
    error,
    reset,
  };
}

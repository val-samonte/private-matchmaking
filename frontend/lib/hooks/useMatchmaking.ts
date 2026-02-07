"use client";

import { useCallback, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAtomValue } from "jotai";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { MatchmakingPlayer } from "@1upmonster/duel";
import { getTeeAuthToken, createTeeProvider, waitForDelegation } from "@/lib/utils/tee";
import { deriveQueuePda, deriveTenantPda } from "@/lib/utils/pda";
import {
  DUEL_PROGRAM_ID,
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
  const wallet = useWallet();
  const profilePda = useAtomValue(playerProfilePdaAtom);

  const [state, setState] = useState<MatchmakingState>("idle");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const subscriptionRef = useRef<number | null>(null);

  const findMatch = useCallback(async () => {
    if (!wallet.publicKey || !profilePda || !wallet.signMessage) {
      throw new Error("Wallet not connected or profile not found");
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setError(null);

      // Derive PDAs
      const [tenantPda] = deriveTenantPda(QUEUE_AUTHORITY);
      const [queuePda] = deriveQueuePda(QUEUE_AUTHORITY);

      // 1. Get TEE auth token (player signs directly, no backend)
      setState("creating_ticket");
      console.log("Authenticating with TEE...");
      const { token } = await getTeeAuthToken(TEE_RPC_URL, wallet);

      // Create L1 provider + SDK player (no skipPreflight on L1 — Anchor/web3.js
      // constructor mismatch garbles on-chain errors when preflight is skipped)
      const l1Connection = new Connection(
        RPC_ENDPOINTS[SOLANA_NETWORK as keyof typeof RPC_ENDPOINTS] || RPC_ENDPOINTS.devnet,
        "confirmed"
      );
      const l1Provider = new AnchorProvider(l1Connection, wallet as any, { commitment: "confirmed" });
      const l1Player = new MatchmakingPlayer(l1Provider, DUEL_PROGRAM_ID);

      // Get ticket PDA from SDK
      const ticketPda = l1Player.getTicketPda(wallet.publicKey, tenantPda);

      // 2. Create MatchTicket on L1
      console.log("Creating MatchTicket on L1...");
      await l1Player.createTicket(tenantPda);
      console.log("Ticket created:", ticketPda.toBase58());

      if (signal.aborted) throw new Error("Search cancelled");

      // 3. Delegate ticket to TEE
      setState("delegating");
      console.log("Delegating ticket to TEE...");
      await l1Player.delegateTicket(wallet.publicKey, tenantPda, ER_VALIDATOR);

      // Wait for delegation to activate
      console.log("Waiting for ticket TEE activation...");
      await waitForDelegation(TEE_RPC_URL, token, ticketPda);

      if (signal.aborted) throw new Error("Search cancelled");

      // 4. Join queue via TEE directly (player signs their own tx)
      setState("joining");
      console.log("Joining queue via TEE...");
      const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, wallet);
      const teePlayer = new MatchmakingPlayer(teeProvider, DUEL_PROGRAM_ID);

      // TEE provider already has skipPreflight: true from createTeeProvider
      await teePlayer.joinQueue(queuePda, tenantPda, profilePda);
      console.log("Joined queue via TEE");

      if (signal.aborted) throw new Error("Search cancelled");

      // 5. Subscribe to ticket PDA on L1 via onAccountChange
      setState("searching");
      console.log("Waiting for match (watching L1 ticket)...");

      const match = await new Promise<MatchResult | null>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
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

        // Subscribe to L1 account changes
        subscriptionRef.current = l1Connection.onAccountChange(
          ticketPda,
          (accountInfo) => {
            try {
              const decoded = l1Player.program.coder.accounts.decode(
                "matchTicket",
                accountInfo.data
              );
              if (decoded.status?.matched) {
                cleanup();
                const opponentKey = decoded.status.matched.opponent;
                const opponentStr = opponentKey.toBase58();
                // Determine role: lexicographically smaller pubkey is player1
                const myKey = wallet.publicKey!.toBuffer();
                const oppKey = new PublicKey(opponentStr).toBuffer();
                const role = Buffer.compare(myKey, oppKey) < 0 ? "player1" : "player2";
                resolve({
                  opponent: opponentStr,
                  matchId: decoded.status.matched.matchId.toString(),
                  role,
                });
              }
            } catch (e) {
              // Ignore decode errors during transition
            }
          },
          "confirmed"
        );
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
  }, [wallet, profilePda]);

  const cancelSearch = useCallback(() => {
    setState("idle");
    setMatchResult(null);
    if (subscriptionRef.current !== null) {
      // Clean up L1 subscription
      subscriptionRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log("Cancelling match search...");
    }

    // Best-effort on-chain cancel (fire-and-forget)
    if (wallet.publicKey && wallet.signMessage) {
      const [tenantPda] = deriveTenantPda(QUEUE_AUTHORITY);
      getTeeAuthToken(TEE_RPC_URL, wallet)
        .then(({ token }) => {
          const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, wallet);
          const teePlayer = new MatchmakingPlayer(teeProvider, DUEL_PROGRAM_ID);
          return teePlayer.cancelTicket(tenantPda, { commitment: "confirmed", skipPreflight: true });
        })
        .then(() => console.log("Ticket cancelled on-chain"))
        .catch((err) => console.warn("Failed to cancel ticket on-chain (best-effort):", err));
    }
  }, [wallet]);

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

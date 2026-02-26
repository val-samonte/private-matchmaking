"use client";

import { useCallback, useState, useRef } from "react";
import { useAtomValue } from "jotai";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { rpcAtom } from "@/lib/atoms/program";
import { useWalletContext } from "@/lib/contexts/WalletContext";
import { getTeeAuthToken, waitForDelegation } from "@/lib/utils/tee";
import { walletToSigner } from "@/lib/utils/wallet-bridge";
import { sendInstruction, sendInstructions } from "@/lib/utils/transaction";
import { deriveQueuePda, deriveTenantPda, deriveTicketPda } from "@/lib/utils/pda";
import {
  DUEL_PROGRAM_ID,
  RPS_GAME_PROGRAM_ID,
  QUEUE_AUTHORITY,
  TEE_RPC_URL,
  TEE_WS_URL,
  ER_VALIDATOR,
  DELEGATION_PROGRAM_ID,
} from "@/lib/constants";
import {
  getCreateTicketInstructionAsync,
  getDelegateTicketInstructionAsync,
  getJoinQueueInstructionAsync,
  getFlushMatchesInstruction,
  getCommitTicketsInstruction,
  getCancelTicketInstructionAsync,
  getCloseTicketInstructionAsync,
  fetchMaybeMatchTicket,
  fetchQueue,
} from "@sdk/generated/duel";
import { accountType } from "@sdk/generated/duel/types";
import { createSolanaRpc } from "@solana/kit";

type MatchmakingState =
  | "idle"
  | "creating_ticket"
  | "delegating"
  | "joining"
  | "searching"
  | "matched"
  | "error";

type MatchResult = {
  opponent: string;
  matchId: string;
  role: "player1" | "player2";
};

export function useMatchmaking() {
  const { publicKey, kitWallet } = useWalletContext();
  const profilePda = useAtomValue(playerProfilePdaAtom);
  const rpc = useAtomValue(rpcAtom);

  const [state, setState] = useState<MatchmakingState>("idle");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const findMatch = useCallback(async () => {
    if (!publicKey || !profilePda || !kitWallet) {
      throw new Error("Wallet not connected or profile not found");
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setError(null);
      const signer = walletToSigner(kitWallet);

      // Derive PDAs
      const [tenantPda] = await deriveTenantPda(QUEUE_AUTHORITY);
      const [queuePda] = await deriveQueuePda(QUEUE_AUTHORITY);
      const [ticketPda] = await deriveTicketPda(publicKey, tenantPda, DUEL_PROGRAM_ID);

      // 1. Clean up any stale ticket
      setState("creating_ticket");
      const existingTicketRes = await rpc.getAccountInfo(ticketPda, { encoding: "base64" }).send();
      const existingTicket = existingTicketRes.value;

      if (existingTicket) {
        if (existingTicket.owner === DELEGATION_PROGRAM_ID) {
          // Ticket is delegated to TEE — cancel on TEE then commit back
          console.log("Stale ticket is delegated — cleaning up via TEE…");
          const { token: cleanupToken } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);
          const cleanupTeeRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${cleanupToken}`);

          try {
            const cancelIx = await getCancelTicketInstructionAsync({ player: signer, tenant: tenantPda });
            await sendInstruction(cleanupTeeRpc, cancelIx, kitWallet);
          } catch (e: any) {
            console.warn("cancelTicket on TEE failed:", e.message);
          }

          // Commit tickets to return to L1 - passing ticket PDAs as remaining accounts
          try {
            const commitIx = getCommitTicketsInstruction({ tenant: tenantPda, payer: signer });
            // Add ticket as remaining account (writable)
            const commitIxWithRemaining = {
              ...commitIx,
              accounts: [
                ...commitIx.accounts,
                { address: ticketPda, role: 3 /* WRITABLE */ },
              ],
            };
            await sendInstruction(cleanupTeeRpc, commitIxWithRemaining as any, kitWallet);
          } catch (e: any) {
            console.warn("commitTickets on TEE failed:", e.message);
          }

          // Wait for L1 to see the undelegated ticket
          console.log("Waiting for ticket to return to L1…");
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const info = await rpc.getAccountInfo(ticketPda, { encoding: "base64" }).send();
            if (!info.value || info.value.owner !== DELEGATION_PROGRAM_ID) break;
          }
        }

        // Close the stale ticket if it's back on L1
        const ticketAfterCommit = await rpc.getAccountInfo(ticketPda, { encoding: "base64" }).send();
        if (ticketAfterCommit.value && ticketAfterCommit.value.owner !== DELEGATION_PROGRAM_ID) {
          console.log("Closing stale ticket on L1…");
          try {
            const closeIx = await getCloseTicketInstructionAsync({ player: signer, tenant: tenantPda });
            await sendInstruction(rpc, closeIx, kitWallet);
          } catch (e: any) {
            console.warn("closeTicket failed:", e.message);
          }
        }
      }

      if (signal.aborted) throw new Error("Search cancelled");

      // 2. Create fresh MatchTicket on L1
      console.log("Creating MatchTicket on L1...");
      const createIx = await getCreateTicketInstructionAsync({ player: signer, tenant: tenantPda });
      await sendInstruction(rpc, createIx, kitWallet);
      console.log("Ticket created:", ticketPda);

      if (signal.aborted) throw new Error("Search cancelled");

      // 3. Delegate ticket to TEE
      setState("delegating");
      console.log("Delegating ticket to TEE...");
      const delegateIx = await getDelegateTicketInstructionAsync({
        pda: ticketPda,
        payer: signer,
        validator: ER_VALIDATOR,
        accountType: accountType("Ticket", { player: publicKey, tenant: tenantPda }),
      });
      await sendInstruction(rpc, delegateIx, kitWallet);

      // 4. Get TEE auth token and wait for activation
      console.log("Authenticating with TEE...");
      const { token } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);

      console.log("Waiting for ticket TEE activation...");
      await waitForDelegation(TEE_RPC_URL, token, ticketPda);

      if (signal.aborted) throw new Error("Search cancelled");

      // 5. Join queue via TEE
      setState("joining");
      console.log("Joining queue via TEE...");
      const teeRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${token}`);

      const joinIx = await getJoinQueueInstructionAsync({
        queue: queuePda,
        tenant: tenantPda,
        playerData: profilePda,
        signer,
      });
      // Append callback program as remaining account so the Tenant PDA callback fires on match
      const joinIxWithCallback = {
        ...joinIx,
        accounts: [...joinIx.accounts, { address: RPS_GAME_PROGRAM_ID, role: 0 as const }],
      };
      await sendInstruction(teeRpc, joinIxWithCallback as any, kitWallet);
      console.log("Joined queue via TEE");

      if (signal.aborted) throw new Error("Search cancelled");

      // 6. Flush pending matches + commit tickets (crank duty)
      try {
        const queueAccount = await fetchQueue(teeRpc, queuePda);
        const pendingMatches = queueAccount.data.pendingMatches;
        console.log("Pending matches in queue:", pendingMatches.length);

        if (pendingMatches.length > 0) {
          const opponentTicketPdas = await Promise.all(
            pendingMatches.map(async (pm) => {
              const [oppTicket] = await deriveTicketPda(pm.player, tenantPda, DUEL_PROGRAM_ID);
              return oppTicket;
            })
          );

          console.log("Flushing pending matches...");
          const flushIx = getFlushMatchesInstruction({ queue: queuePda, tenant: tenantPda, signer });
          // Add opponent tickets as remaining accounts (writable)
          const flushIxWithRemaining = {
            ...flushIx,
            accounts: [
              ...flushIx.accounts,
              ...opponentTicketPdas.map((addr) => ({ address: addr, role: 3 })),
            ],
          };
          await sendInstruction(teeRpc, flushIxWithRemaining as any, kitWallet);
          console.log("Pending matches flushed");

          // Commit all matched tickets back to L1
          const allTickets = [ticketPda, ...opponentTicketPdas];
          console.log("Committing tickets to L1...", allTickets);
          const commitIx = getCommitTicketsInstruction({ tenant: tenantPda, payer: signer });
          const commitIxWithRemaining = {
            ...commitIx,
            accounts: [
              ...commitIx.accounts,
              ...allTickets.map((addr) => ({ address: addr, role: 3 })),
            ],
          };
          await sendInstruction(teeRpc, commitIxWithRemaining as any, kitWallet);
          console.log("Tickets committed to L1");
        } else {
          console.log("No pending matches — waiting for opponent to join and flush");
        }
      } catch (flushErr: any) {
        console.warn("Flush/commit failed (other player may handle it):", flushErr.message);
      }

      if (signal.aborted) throw new Error("Search cancelled");

      // 7. Poll L1 for match (watching ticket PDA)
      setState("searching");
      console.log("Waiting for match (watching L1 ticket)...");

      const match = await new Promise<MatchResult | null>((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let pollId: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (pollId) clearInterval(pollId);
        };

        signal.addEventListener("abort", () => { cleanup(); resolve(null); });

        // 2-minute timeout
        timeoutId = setTimeout(() => { cleanup(); resolve(null); }, 120000);

        const checkTicket = async () => {
          try {
            const maybeTicket = await fetchMaybeMatchTicket(rpc, ticketPda);
            if (!maybeTicket.exists) return;
            const status = maybeTicket.data.status;
            if (status.__kind === "Matched") {
              cleanup();
              const opponentAddr = status.opponent;
              const matchId = status.matchId.toString();
              // Determine role by comparing addresses lexicographically
              const role = publicKey < opponentAddr ? "player1" : "player2";
              resolve({ opponent: opponentAddr, matchId, role });
            }
          } catch {
            // Ignore decode errors during transition
          }
        };

        // Immediate check + poll every 3s
        checkTicket();
        pollId = setInterval(checkTicket, 3000);
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
  }, [publicKey, profilePda, kitWallet, rpc]);

  const cancelSearch = useCallback(() => {
    setState("idle");
    setMatchResult(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log("Cancelling match search...");
    }

    // Best-effort on-chain cancel (fire-and-forget)
    if (publicKey && kitWallet) {
      const signer = walletToSigner(kitWallet);
      deriveTenantPda(QUEUE_AUTHORITY)
        .then(async ([tenantPda]) => {
          const { token } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);
          const teeRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${token}`);
          const cancelIx = await getCancelTicketInstructionAsync({ player: signer, tenant: tenantPda });
          return sendInstruction(teeRpc, cancelIx, kitWallet);
        })
        .then(() => console.log("Ticket cancelled on-chain"))
        .catch((err) => console.warn("Failed to cancel ticket on-chain (best-effort):", err));
    }
  }, [publicKey, kitWallet]);

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

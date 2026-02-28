"use client";

import { useCallback, useState, useRef } from "react";
import { useAtomValue } from "jotai";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { rpcAtom } from "@/lib/atoms/program";
import { useWalletContext } from "@/lib/contexts/WalletContext";
import { getTeeAuthToken } from "@/lib/utils/tee";
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
  getSetupTicketPermissionInstructionAsync,
  getJoinQueueInstructionAsync,
  getFlushMatchesInstruction,
  getCommitTicketsInstruction,
  getCancelTicketInstructionAsync,
  getCloseTicketInstructionAsync,
  fetchMaybeMatchTicket,
  fetchQueue,
} from "@sdk/generated/duel";
import { accountType } from "@sdk/generated/duel/types";
import {
  PERMISSION_PROGRAM,
  DELEGATION_PROGRAM as PERM_DELEGATION_PROGRAM,
  derivePermissionPda,
  derivePermissionDelegationPdas,
} from "@sdk/utils";
import { createSolanaRpc, AccountRole, type Address, type Instruction } from "@solana/kit";

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
                { address: ticketPda, role: 1 /* AccountRole.WRITABLE */ },
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

      // TX A (1 wallet approval): createTicket + setupPermission
      // createTicket init-s the PDA; setupPermission CPIs into it — valid in one TX.
      setState("delegating");
      console.log("Creating ticket + setting up permission (TX A)...");
      const permissionPda = await derivePermissionPda(ticketPda);
      const createIx = await getCreateTicketInstructionAsync({ player: signer, tenant: tenantPda });
      const setupPermIx = await getSetupTicketPermissionInstructionAsync({
        player: signer,
        tenant: tenantPda,
        permission: permissionPda,
        permissionProgram: PERMISSION_PROGRAM,
      });
      await sendInstructions(rpc, [createIx, setupPermIx], kitWallet);
      console.log("Ticket created:", ticketPda);

      if (signal.aborted) throw new Error("Search cancelled");

      // TX B (1 wallet approval): delegatePermission + delegateTicket
      // Both are independent delegation calls; batching saves one round-trip.
      console.log("Delegating permission + ticket (TX B)...");
      const { delegationBuffer, delegationRecord, delegationMetadata } =
        await derivePermissionDelegationPdas(permissionPda);
      const delegatePermIx: Instruction = {
        programAddress: PERMISSION_PROGRAM,
        data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]),
        accounts: [
          { address: signer.address, role: AccountRole.WRITABLE_SIGNER },
          { address: signer.address, role: AccountRole.READONLY_SIGNER },
          { address: ticketPda, role: AccountRole.READONLY },
          { address: permissionPda, role: AccountRole.WRITABLE },
          { address: "11111111111111111111111111111111" as Address, role: AccountRole.READONLY },
          { address: PERMISSION_PROGRAM, role: AccountRole.READONLY },
          { address: delegationBuffer, role: AccountRole.WRITABLE },
          { address: delegationRecord, role: AccountRole.WRITABLE },
          { address: delegationMetadata, role: AccountRole.WRITABLE },
          { address: PERM_DELEGATION_PROGRAM, role: AccountRole.READONLY },
          { address: ER_VALIDATOR, role: AccountRole.READONLY },
        ],
      };
      const delegateIx = await getDelegateTicketInstructionAsync({
        pda: ticketPda,
        payer: signer,
        validator: ER_VALIDATOR,
        accountType: accountType("Ticket", { player: publicKey, tenant: tenantPda }),
      });
      await sendInstructions(rpc, [delegatePermIx, delegateIx as any], kitWallet);

      // 5. Get TEE auth token
      console.log("Authenticating with TEE...");
      const { token } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);

      if (signal.aborted) throw new Error("Search cancelled");

      // 6. Join queue via TEE
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

      // 7. Flush pending matches + commit tickets (crank duty)
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
              ...opponentTicketPdas.map((addr) => ({ address: addr, role: 1 /* AccountRole.WRITABLE */ })),
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
              ...allTickets.map((addr) => ({ address: addr, role: 1 /* AccountRole.WRITABLE */ })),
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

      // 8. Poll L1 for match (watching ticket PDA)
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

        // 2-minute timeout — cancel ticket on TEE so queue slot is freed
        timeoutId = setTimeout(() => {
          cleanup();
          if (publicKey && kitWallet) {
            const signer = walletToSigner(kitWallet);
            deriveTenantPda(QUEUE_AUTHORITY)
              .then(async ([tenantPda]) => {
                const { token } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);
                const cleanupRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${token}`);
                const cancelIx = await getCancelTicketInstructionAsync({ player: signer, tenant: tenantPda });
                await sendInstruction(cleanupRpc, cancelIx, kitWallet);
                console.log("Ticket cancelled after timeout");
              })
              .catch((err) => console.warn("Timeout ticket cancel failed (best-effort):", err));
          }
          resolve(null);
        }, 120000);

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

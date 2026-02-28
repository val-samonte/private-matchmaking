"use client";

import { useCallback, useState, useRef } from "react";
import { useAtomValue } from "jotai";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { rpcAtom } from "@/lib/atoms/program";
import { walletAtom } from "@/lib/atoms/wallet";
import {
  sessionSignerAtom,
  sessionKitWalletAtom,
  isSessionActiveAtom,
  duelSessionTokenPdaAtom,
} from "@/lib/atoms/session";
import { createAuthenticatedTeeRpc } from "@/lib/utils/tee";
import { walletToSigner } from "@/lib/utils/wallet-bridge";
import { sendInstruction, withRemainingAccounts } from "@/lib/utils/transaction";
import { relayTx } from "@/lib/utils/relay";

import { deriveQueuePda, deriveTenantPda, deriveTicketPda } from "@/lib/utils/pda";
import {
  DUEL_PROGRAM_ID,
  RPS_GAME_PROGRAM_ID,
  QUEUE_AUTHORITY,
  TEE_RPC_URL,
  DELEGATION_PROGRAM_ID,
  SERVER_ADDRESS,
} from "@/lib/constants";
import {
  getCreateTicketInstructionAsync,
  getSetupTicketPermissionInstructionAsync,
  getJoinQueueInstructionAsync,
  getFlushMatchesInstruction,
  getCommitTicketsInstruction,
  getCancelTicketInstructionAsync,
  fetchMaybeMatchTicket,
  fetchQueue,
} from "@sdk/generated/duel";
import {
  PERMISSION_PROGRAM,
  derivePermissionPda,
} from "@sdk/utils";
import { AccountRole, type Address, type Instruction, type TransactionPartialSigner } from "@solana/kit";

/**
 * Creates a no-op "dummy" signer for an address we don't own client-side.
 * Used for the server fee-payer slot in relay transactions — the actual
 * signing happens server-side; we only need the address for account key ordering.
 */
function serverDummySigner(address: Address): TransactionPartialSigner {
  return {
    address,
    signTransactions: async (txs) => txs.map(() => ({} as Record<Address, import("@solana/kit").SignatureBytes>)),
  };
}

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
  const publicKey = useAtomValue(walletAtom);
  const sessionSigner = useAtomValue(sessionSignerAtom);
  const sessionKitWallet = useAtomValue(sessionKitWalletAtom);
  const isSessionActive = useAtomValue(isSessionActiveAtom);
  const duelSessionTokenPda = useAtomValue(duelSessionTokenPdaAtom);
  const profilePda = useAtomValue(playerProfilePdaAtom);
  const rpc = useAtomValue(rpcAtom);

  const [state, setState] = useState<MatchmakingState>("idle");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const findMatch = useCallback(async () => {
    if (!publicKey || !profilePda) {
      throw new Error("Wallet not connected or profile not found");
    }
    if (!isSessionActive || !sessionSigner || !sessionKitWallet) {
      throw new Error("Session key required. Please create a session first.");
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setError(null);

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
          // Ticket is delegated to TEE — cancel on TEE using session key
          console.log("Stale ticket is delegated — cleaning up via TEE…");
          const cleanupTeeRpc = await createAuthenticatedTeeRpc(TEE_RPC_URL, sessionKitWallet);

          try {
            // Cancel: player=publicKey (Address), signer=session key, sessionToken=duelSessionTokenPda
            const cancelIx = await getCancelTicketInstructionAsync({
              player: publicKey,                          // Address: real player for PDA seeds
              signer: walletToSigner(sessionKitWallet),  // session key signs
              tenant: tenantPda,
              sessionToken: duelSessionTokenPda ?? undefined,
            });
            await sendInstruction(cleanupTeeRpc, cancelIx, sessionKitWallet);
          } catch (e: unknown) {
            console.warn("cancelTicket on TEE failed:", (e as Error).message);
          }

          try {
            const commitIx = getCommitTicketsInstruction({
              tenant: tenantPda,
              payer: walletToSigner(sessionKitWallet),
            });
            await sendInstruction(cleanupTeeRpc, withRemainingAccounts(commitIx, [
              { address: ticketPda, role: AccountRole.WRITABLE },
            ]) as unknown as Instruction, sessionKitWallet);
          } catch (e: unknown) {
            console.warn("commitTickets on TEE failed:", (e as Error).message);
          }

          // Wait for ticket to return to L1
          console.log("Waiting for ticket to return to L1…");
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const info = await rpc.getAccountInfo(ticketPda, { encoding: "base64" }).send();
            if (!info.value || info.value.owner !== DELEGATION_PROGRAM_ID) break;
          }
        }

        // Close stale ticket on L1 if needed
        const ticketAfterCommit = await rpc.getAccountInfo(ticketPda, { encoding: "base64" }).send();
        if (ticketAfterCommit.value && ticketAfterCommit.value.owner !== DELEGATION_PROGRAM_ID) {
          console.log("Closing stale ticket on L1…");
          try {
            // For close: still needs real player wallet as signer (owns the PDA for rent reclaim)
            // TODO: once session auth on close_ticket lands, use session key here too
            console.warn("close_ticket not available without wallet popup in session-key mode — skipping");
          } catch (e: unknown) {
            console.warn("closeTicket failed:", (e as Error).message);
          }
        }
      }

      if (signal.aborted) throw new Error("Search cancelled");

      // 2. TX A via relay: createTicket + setupTicketPermission
      //    Session key signs (slot 1), server pays (slot 0) via /api/relay
      setState("delegating");
      console.log("Creating ticket + setting up permission via relay (TX A)…");

      const permissionPda = await derivePermissionPda(ticketPda);
      const serverSigner = serverDummySigner(SERVER_ADDRESS);

      const createIx = await getCreateTicketInstructionAsync({
        player: publicKey,           // real player (UncheckedAccount → Address)
        signer: sessionSigner,       // session key (TransactionSigner, signs slot 1)
        payer: serverSigner,         // server dummy (address only, relay signs slot 0)
        tenant: tenantPda,
        sessionToken: duelSessionTokenPda ?? undefined,
      }, { programAddress: DUEL_PROGRAM_ID });

      const setupPermIx = await getSetupTicketPermissionInstructionAsync({
        player: publicKey,
        signer: sessionSigner,
        payer: serverSigner,
        tenant: tenantPda,
        permission: permissionPda,
        permissionProgram: PERMISSION_PROGRAM,
        sessionToken: duelSessionTokenPda ?? undefined,
        sessionKey: sessionSigner.address,  // add session key to Permission members
      }, { programAddress: DUEL_PROGRAM_ID });

      await relayTx(rpc, [createIx as unknown as Instruction, setupPermIx as unknown as Instruction], sessionSigner, SERVER_ADDRESS);
      console.log("Ticket created via relay:", ticketPda);

      if (signal.aborted) throw new Error("Search cancelled");

      // 3. Server delegates Permission PDA + ticket
      console.log("Delegating permission + ticket via server API…");
      const delegateRes = await fetch("/api/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerAddress: publicKey }),
      });
      if (!delegateRes.ok) {
        const err = await delegateRes.json() as { error?: string };
        throw new Error(`Delegation failed: ${err.error || delegateRes.statusText}`);
      }
      console.log("Delegation complete");

      if (signal.aborted) throw new Error("Search cancelled");

      // 4. Join queue via TEE (session key authenticates + signs)
      setState("joining");
      console.log("Joining queue via TEE (session key)…");
      const teeRpc = await createAuthenticatedTeeRpc(TEE_RPC_URL, sessionKitWallet);

      const joinIx = await getJoinQueueInstructionAsync({
        queue: queuePda,
        tenant: tenantPda,
        playerData: profilePda,
        player: publicKey,           // real player (UncheckedAccount)
        signer: sessionSigner,       // session key signs
        sessionToken: duelSessionTokenPda ?? undefined,
      }, { programAddress: DUEL_PROGRAM_ID });

      await sendInstruction(teeRpc, withRemainingAccounts(joinIx, [
        { address: RPS_GAME_PROGRAM_ID, role: AccountRole.READONLY },
      ]) as unknown as Instruction, sessionKitWallet);
      console.log("Joined queue via TEE");

      if (signal.aborted) throw new Error("Search cancelled");

      // 5. Flush pending matches + commit (crank duty, session key signs)
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

          console.log("Flushing pending matches…");
          const flushIx = getFlushMatchesInstruction({
            queue: queuePda,
            tenant: tenantPda,
            signer: sessionSigner,
          });
          await sendInstruction(teeRpc, withRemainingAccounts(flushIx,
            opponentTicketPdas.map((addr) => ({ address: addr, role: AccountRole.WRITABLE })),
          ) as unknown as Instruction, sessionKitWallet);
          console.log("Pending matches flushed");

          const allTickets = [ticketPda, ...opponentTicketPdas];
          console.log("Committing tickets to L1…", allTickets);
          const commitIx = getCommitTicketsInstruction({
            tenant: tenantPda,
            payer: sessionSigner,
          });
          await sendInstruction(teeRpc, withRemainingAccounts(commitIx,
            allTickets.map((addr) => ({ address: addr, role: AccountRole.WRITABLE })),
          ) as unknown as Instruction, sessionKitWallet);
          console.log("Tickets committed to L1");
        } else {
          console.log("No pending matches — waiting for opponent to join and flush");
        }
      } catch (flushErr: unknown) {
        console.warn("Flush/commit failed (other player may handle it):", (flushErr as Error).message);
      }

      if (signal.aborted) throw new Error("Search cancelled");

      // 6. Poll L1 for match
      setState("searching");
      console.log("Waiting for match (watching L1 ticket)…");

      const match = await new Promise<MatchResult | null>((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let pollId: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (pollId) clearInterval(pollId);
        };

        signal.addEventListener("abort", () => { cleanup(); resolve(null); });

        timeoutId = setTimeout(() => {
          cleanup();
          if (publicKey && sessionKitWallet) cancelTicketFireAndForget(sessionKitWallet, publicKey, tenantPda);
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
              const role = publicKey < opponentAddr ? "player1" : "player2";
              resolve({ opponent: opponentAddr, matchId, role });
            }
          } catch {
            // ignore decode errors during transition
          }
        };

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
    } catch (err: unknown) {
      if ((err as Error).message === "Search cancelled") {
        console.log("Match search cancelled by user");
        setState("idle");
        return null;
      }
      console.error("Matchmaking error:", err);
      setError((err as Error).message || "Failed to find match");
      setState("error");
      throw err;
    }
  }, [publicKey, profilePda, sessionSigner, sessionKitWallet, isSessionActive, duelSessionTokenPda, rpc]);

  const cancelSearch = useCallback(() => {
    setState("idle");
    setMatchResult(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log("Cancelling match search…");
    }
  }, []);

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

/**
 * Fire-and-forget: cancel a player's TEE ticket so the queue slot is freed.
 */
function cancelTicketFireAndForget(
  sessionKitWallet: import("@/lib/utils/wallet-bridge").KitWallet,
  publicKey: Address,
  tenantPda: Address,
): void {
  const signer = walletToSigner(sessionKitWallet);
  createAuthenticatedTeeRpc(TEE_RPC_URL, sessionKitWallet)
    .then(async (teeRpc) => {
      const cancelIx = await getCancelTicketInstructionAsync({
        player: publicKey,   // Address: real player for PDA seeds
        signer,              // session key signs
        tenant: tenantPda,
        // sessionToken omitted in fire-and-forget path (best-effort, not critical)
      });
      await sendInstruction(teeRpc, cancelIx, sessionKitWallet);
      console.log("Ticket cancelled on-chain for", publicKey);
    })
    .catch((err: unknown) => console.warn("Failed to cancel ticket (best-effort):", (err as Error).message));
}

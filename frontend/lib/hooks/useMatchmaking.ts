"use client";

import { useCallback, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAtomValue } from "jotai";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { getTeeAuthToken, createTeeProvider, waitForDelegation } from "@/lib/utils/tee";
import { deriveTicketPda, deriveQueuePda, deriveTenantPda } from "@/lib/utils/pda";
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
      const [ticketPda] = deriveTicketPda(wallet.publicKey, tenantPda);

      // 1. Get TEE auth token (player signs directly, no backend)
      setState("creating_ticket");
      console.log("Authenticating with TEE...");
      const { token } = await getTeeAuthToken(TEE_RPC_URL, wallet);

      // Create L1 connection for ticket creation
      const l1Connection = new Connection(
        RPC_ENDPOINTS[SOLANA_NETWORK as keyof typeof RPC_ENDPOINTS] || RPC_ENDPOINTS.devnet,
        "confirmed"
      );
      const l1Provider = new AnchorProvider(l1Connection, wallet as any, { commitment: "confirmed" });

      // Load the duel program IDL dynamically
      const DuelIDL = (await import("@1upmonster/duel/dist/duel.json")).default;
      const modifiedIdl = { ...DuelIDL } as any;
      modifiedIdl.address = DUEL_PROGRAM_ID.toBase58();

      // 2. Create MatchTicket on L1
      console.log("Creating MatchTicket on L1...");
      const l1Program = new Program(modifiedIdl, l1Provider);
      await l1Program.methods
        .createTicket()
        .accountsPartial({
          ticket: ticketPda,
          tenant: tenantPda,
          player: wallet.publicKey,
        })
        .rpc();
      console.log("Ticket created:", ticketPda.toBase58());

      if (signal.aborted) throw new Error("Search cancelled");

      // 3. Delegate ticket to TEE
      setState("delegating");
      console.log("Delegating ticket to TEE...");
      await l1Program.methods
        .delegateTicket({ ticket: { player: wallet.publicKey, tenant: tenantPda } } as any)
        .accounts({
          pda: ticketPda,
          payer: wallet.publicKey,
          validator: ER_VALIDATOR,
        } as any)
        .rpc();

      // Wait for delegation to activate
      console.log("Waiting for ticket TEE activation...");
      await waitForDelegation(TEE_RPC_URL, token, ticketPda);

      if (signal.aborted) throw new Error("Search cancelled");

      // 4. Join queue via TEE directly (player signs their own tx)
      setState("joining");
      console.log("Joining queue via TEE...");
      const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, wallet);
      const teeProgram = new Program(modifiedIdl, teeProvider);

      await teeProgram.methods
        .joinQueue()
        .accountsPartial({
          queue: queuePda,
          tenant: tenantPda,
          playerData: profilePda,
          playerTicket: ticketPda,
          signer: wallet.publicKey,
        })
        .rpc();
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
              const decoded = l1Program.coder.accounts.decode(
                "matchTicket",
                accountInfo.data
              );
              if (decoded.status?.matched) {
                cleanup();
                resolve({
                  opponent: decoded.status.matched.opponent.toBase58(),
                  matchId: decoded.status.matched.matchId.toString(),
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

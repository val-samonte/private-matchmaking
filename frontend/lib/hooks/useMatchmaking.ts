"use client";

import { useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useAtomValue } from "jotai";
import { PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { getTeeAuthToken, createTeeProvider, waitForDelegation } from "@/lib/utils/tee";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { deriveQueuePda, deriveTenantPda } from "@/lib/utils/pda";
import { 
  RPS_GAME_PROGRAM_ID,
  DUEL_PROGRAM_ID, 
  TEE_RPC_URL, 
  TEE_WS_URL, 
  ER_VALIDATOR,
  QUEUE_AUTHORITY
} from "@/lib/constants";
import RPS_IDL from "@/lib/types/rps_game.json";
import DUEL_IDL from "@1upmonster/duel/dist/duel.json";
import type { RpsGame } from "@/lib/types/rps_game_idl";
import type { Duel } from "@/lib/types/duel_idl";

export type MatchmakingState = 
  | "idle" 
  | "authenticating" 
  | "delegating" 
  | "joining" 
  | "searching" 
  | "matched" 
  | "error";

export interface MatchResult {
  opponent: PublicKey;
  gameId: number;
}

export function useMatchmaking() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const profilePda = useAtomValue(playerProfilePdaAtom);
  
  const [state, setState] = useState<MatchmakingState>("idle");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const findMatch = useCallback(async () => {
    if (!wallet.publicKey || !profilePda) {
      throw new Error("Wallet not connected or profile not found");
    }

    try {
      setState("authenticating");
      setError(null);

      // 1. Get TEE Auth Token
      console.log("Getting TEE auth token...");
      const { token } = await getTeeAuthToken(TEE_RPC_URL, wallet);
      
      // 2. Create TEE Provider
      const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, wallet);
      
      // 3. Delegate Profile PDA (if not already delegated)
      setState("delegating");
      console.log("Delegating profile PDA...");
      
      const l1Provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
      const rpsProgram = new Program(RPS_IDL as any, l1Provider) as Program<RpsGame>;
      
      try {
        await rpsProgram.methods
          .delegatePda({ playerProfile: { player: wallet.publicKey } })
          .accounts({
            pda: profilePda,
            payer: wallet.publicKey,
            validator: ER_VALIDATOR,
          } as any)
          .rpc();
        
        // Wait for delegation
        console.log("Waiting for profile delegation...");
        await waitForDelegation(TEE_RPC_URL, token, profilePda);
        console.log("Profile delegated successfully");
      } catch (err: any) {
        // Already delegated or other error - continue
        console.log("Delegation status:", err.message);
      }

      // 4. Derive Queue and Tenant PDAs
      // Queue authority is from the constants (the wallet that initialized the queue)
      const [queuePda] = deriveQueuePda(QUEUE_AUTHORITY, DUEL_PROGRAM_ID);
      const [tenantPda] = deriveTenantPda(QUEUE_AUTHORITY, DUEL_PROGRAM_ID);

      console.log("Queue PDA:", queuePda.toBase58());
      console.log("Tenant PDA:", tenantPda.toBase58());

      // 5. Join Queue using TEE provider
      setState("joining");
      console.log("Joining matchmaking queue...");
      
      const duelProgram = new Program(DUEL_IDL as any, teeProvider) as Program<Duel>;
      
      await duelProgram.methods
        .joinQueue()
        .accountsPartial({
          queue: queuePda,
          tenant: tenantPda,
          playerData: profilePda,
          signer: wallet.publicKey,
        })
        .rpc();

      console.log("Joined queue successfully");

      // 6. Poll for match
      setState("searching");
      console.log("Searching for opponent...");
      
      const match = await pollForMatch(duelProgram, queuePda, wallet.publicKey);
      
      if (match) {
        setMatchResult(match);
        setState("matched");
        console.log("Match found!", match);
        return match;
      } else {
        throw new Error("Match search timed out");
      }

    } catch (err: any) {
      console.error("Matchmaking error:", err);
      setError(err.message || "Failed to find match");
      setState("error");
      throw err;
    }
  }, [wallet, connection, profilePda]);

  const cancelSearch = useCallback(() => {
    setState("idle");
    setMatchResult(null);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setMatchResult(null);
    setError(null);
  }, []);

  return {
    state,
    matchResult,
    error,
    findMatch,
    cancelSearch,
    reset,
  };
}

// Helper to poll queue for match
async function pollForMatch(
  duelProgram: Program<Duel>,
  queuePda: PublicKey,
  playerPubkey: PublicKey,
  maxAttempts = 60, // 2 minutes (2s intervals)
  pollInterval = 2000
): Promise<MatchResult | null> {
  
  let previousQueueState: any = null;
  let myQueueEntry: any = null;
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    try {
      const queueAccount = await duelProgram.account.queue.fetch(queuePda);
      
      // Find my entry in the queue
      const myEntry = queueAccount.entries.find((entry: any) => 
        entry.player.equals(playerPubkey)
      );
      
      // Store my entry for later
      if (myEntry && !myQueueEntry) {
        myQueueEntry = myEntry;
      }
      
      // Case 1: I'm still in the queue - no match yet
      if (myEntry) {
        console.log(`Polling attempt ${i + 1}/${maxAttempts} - still in queue (${queueAccount.entries.length} total)`);
        previousQueueState = queueAccount;
        continue;
      }
      
      // Case 2: I was in the queue before, but now I'm not
      // This means I was matched!
      if (previousQueueState && !myEntry) {
        console.log("Player removed from queue - match found!");
        
        // Try to find who I was matched with by comparing queue states
        // The other player should also be removed
        const previousPlayers = previousQueueState.entries.map((e: any) => e.player.toBase58());
        const currentPlayers = queueAccount.entries.map((e: any) => e.player.toBase58());
        
        // Find players that were removed (should be 2: me and opponent)
        const removedPlayers = previousPlayers.filter((p: string) => !currentPlayers.includes(p));
        
        // The opponent is the removed player that's not me
        const opponentPubkeyStr = removedPlayers.find((p: string) => p !== playerPubkey.toBase58());
        
        if (opponentPubkeyStr) {
          const opponent = new PublicKey(opponentPubkeyStr);
          const gameId = Date.now();
          
          console.log("Matched with opponent:", opponent.toBase58());
          
          return {
            opponent,
            gameId,
          };
        } else {
          // Fallback: couldn't determine opponent from queue diff
          // This shouldn't happen in normal flow
          console.warn("Could not determine opponent from queue state");
          return {
            opponent: new PublicKey("11111111111111111111111111111111"),
            gameId: Date.now(),
          };
        }
      }
      
      // Case 3: I was never in the queue (error state)
      if (!previousQueueState) {
        console.error("Player was never found in queue - possible error");
        throw new Error("Player not found in matchmaking queue");
      }
      
    } catch (err) {
      console.error("Poll error:", err);
      // Continue polling even on errors
    }
  }
  
  // Timeout - no match found
  console.log("Match search timed out");
  return null;
}

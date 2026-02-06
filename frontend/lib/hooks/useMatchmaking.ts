"use client";

import { useCallback, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAtomValue } from "jotai";
import { playerProfilePdaAtom } from "@/lib/atoms/player";

type MatchmakingState = "idle" | "joining" | "searching" | "matched" | "error";

type MatchResult = {
  opponent: string;
  gameId: string;
  role: "player1" | "player2";
};

export function useMatchmaking() {
  const wallet = useWallet();
  const profilePda = useAtomValue(playerProfilePdaAtom);
  
  const [state, setState] = useState<MatchmakingState>("idle");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const findMatch = useCallback(async () => {
    if (!wallet.publicKey || !profilePda) {
      throw new Error("Wallet not connected or profile not found");
    }

    // Create abort controller for this search
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setState("joining");
      setError(null);

      console.log("Joining matchmaking queue via API...");
      
      // Call backend API to join queue
      const joinResponse = await fetch("/api/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerPubkey: wallet.publicKey.toBase58(),
          profilePda: profilePda.toBase58(),
        }),
      });

      if (!joinResponse.ok) {
        const errorData = await joinResponse.json();
        throw new Error(errorData.error || "Failed to join queue");
      }

      const joinData = await joinResponse.json();
      console.log("✅ Joined queue:", joinData);

      // Poll for match
      setState("searching");
      console.log("Searching for opponent...");
      
      const match = await pollForMatchViaAPI(wallet.publicKey.toBase58(), signal);
      
      if (match) {
        setMatchResult(match);
        setState("matched");
        console.log("Match found!", match);
        return match;
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

// Helper to poll queue for match via API
async function pollForMatchViaAPI(
  playerPubkey: string,
  signal?: AbortSignal,
  maxAttempts = 60, // 2 minutes (2s intervals)
  pollInterval = 2000
): Promise<MatchResult | null> {
  for (let i = 0; i < maxAttempts; i++) {
    // Check if cancelled
    if (signal?.aborted) {
      console.log("Polling cancelled");
      return null;
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    try {
      const response = await fetch(`/api/matchmaking/poll?playerPubkey=${playerPubkey}`);
      
      if (!response.ok) {
        console.error("Poll error:", await response.text());
        continue;
      }

      const data = await response.json();
      
      console.log(`Polling (${i + 1}/${maxAttempts}):`, data.status, `(${data.queueLength} in queue)`);
      
      if (data.status === "matched") {
        // Player was matched!
        return {
          opponent: "matched", // TODO: Get actual opponent from match result
          gameId: "game123", // TODO: Get actual game ID
        };
      }
      
      // Still searching...
    } catch (err) {
      console.error("Poll error:", err);
    }
  }
  
  return null; // Timeout
}

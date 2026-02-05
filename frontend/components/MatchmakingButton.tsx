"use client";

import { useMatchmaking } from "@/lib/hooks/useMatchmaking";
import { PublicKey } from "@solana/web3.js";

interface MatchmakingButtonProps {
  onMatchFound: (opponent: PublicKey, gameId: number) => void;
}

export function MatchmakingButton({ onMatchFound }: MatchmakingButtonProps) {
  const { state, matchResult, error, findMatch, cancelSearch } = useMatchmaking();

  const handleClick = async () => {
    if (state === "searching") {
      cancelSearch();
    } else {
      try {
        const match = await findMatch();
        if (match) {
          onMatchFound(match.opponent, match.gameId);
        }
      } catch (err) {
        console.error("Matchmaking error:", err);
      }
    }
  };

  const getButtonText = () => {
    switch (state) {
      case "idle":
      case "error":
        return "Find Match";
      case "authenticating":
        return "Authenticating...";
      case "delegating":
        return "Delegating Profile...";
      case "joining":
        return "Joining Queue...";
      case "searching":
        return "Searching for Opponent...";
      case "matched":
        return "Match Found!";
      default:
        return "Find Match";
    }
  };

  const isDisabled = state !== "idle" && state !== "searching" && state !== "error";
  const isSearching = state === "searching";

  return (
    <div className="space-y-4">
      <div className="text-center">
        <button
          onClick={handleClick}
          disabled={isDisabled}
          className="bg-gradient-primary text-white font-semibold py-4 px-12 rounded-xl hover:opacity-90 transition-all hover:scale-105 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {getButtonText()}
          {isSearching && " (Click to Cancel)"}
        </button>
      </div>

      {isSearching && (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {error && (
        <div className="glass rounded-xl p-4 bg-error/10 border-error/30">
          <p className="text-error text-sm text-center">{error}</p>
        </div>
      )}

      {state === "matched" && matchResult && (
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-success font-semibold mb-2">Match Found!</p>
          <p className="text-sm text-foreground-muted">
            Opponent: {matchResult.opponent.toBase58().slice(0, 8)}...
          </p>
        </div>
      )}
    </div>
  );
}

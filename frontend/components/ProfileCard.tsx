"use client";

import { usePlayerProfile } from "@/lib/hooks/usePlayerProfile";
import { formatElo } from "@/lib/types/rps";

export function ProfileCard() {
  const { profile, hasProfile } = usePlayerProfile();

  if (!hasProfile || !profile) {
    return null;
  }

  const winRate = profile.gamesPlayed.toNumber() > 0
    ? ((profile.gamesWon.toNumber() / profile.gamesPlayed.toNumber()) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <h2 className="text-2xl font-bold text-center">Your Stats</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-4xl font-bold gradient-text">
            {formatElo(profile.elo)}
          </div>
          <div className="text-sm text-foreground-muted">ELO Rating</div>
        </div>

        <div className="text-center">
          <div className="text-4xl font-bold text-primary">
            {winRate}%
          </div>
          <div className="text-sm text-foreground-muted">Win Rate</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-glass-border">
        <div className="text-center">
          <div className="text-2xl font-semibold">
            {profile.gamesPlayed.toString()}
          </div>
          <div className="text-xs text-foreground-muted">Games Played</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-semibold text-success">
            {profile.gamesWon.toString()}
          </div>
          <div className="text-xs text-foreground-muted">Wins</div>
        </div>
      </div>
    </div>
  );
}

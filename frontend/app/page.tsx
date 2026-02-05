"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/WalletButton";
import { ProfileCard } from "@/components/ProfileCard";
import { CreateProfileButton } from "@/components/CreateProfileButton";
import { MatchmakingButton } from "@/components/MatchmakingButton";
import { GameBoard } from "@/components/GameBoard";
import { usePlayerProfile } from "@/lib/hooks/usePlayerProfile";

type PageState = "menu" | "matchmaking" | "game";

export default function HomePage() {
  const { connected } = useWallet();
  const { hasProfile } = usePlayerProfile();
  
  const [pageState, setPageState] = useState<PageState>("menu");
  const [opponent, setOpponent] = useState<PublicKey | null>(null);
  const [gameId, setGameId] = useState<number | null>(null);

  const handleMatchFound = (opponentPubkey: PublicKey, newGameId: number) => {
    setOpponent(opponentPubkey);
    setGameId(newGameId);
    setPageState("game");
  };

  const handleGameComplete = () => {
    setPageState("menu");
    setOpponent(null);
    setGameId(null);
  };

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold gradient-text">
            Rock Paper Scissors
          </h1>
          <p className="text-foreground-muted text-lg">
            Play on Solana with private matchmaking
          </p>
        </div>

        {/* Game State */}
        {pageState === "game" && opponent && gameId !== null ? (
          <GameBoard 
            opponent={opponent} 
            gameId={gameId} 
            onGameComplete={handleGameComplete}
          />
        ) : (
          <>
            {/* Main Content Card */}
            <div className="glass rounded-2xl p-8 space-y-6">
              <div className="flex justify-center">
                <WalletButton />
              </div>

              {connected && !hasProfile && (
                <div className="space-y-4">
                  <div className="text-center text-foreground-muted">
                    <p className="text-lg font-semibold mb-2">Welcome!</p>
                    <p>Create your on-chain account to start playing</p>
                  </div>
                  <CreateProfileButton />
                </div>
              )}

              {connected && hasProfile && (
                <div className="space-y-6">
                  <ProfileCard />
                  <MatchmakingButton onMatchFound={handleMatchFound} />
                </div>
              )}

              {!connected && (
                <div className="text-center text-foreground-muted">
                  <p>Connect your wallet to get started</p>
                  <p className="text-sm mt-2">
                    You'll need to create an on-chain account (costs ~0.002 SOL)
                  </p>
                </div>
              )}
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass rounded-xl p-8 text-center">
                <div className="text-3xl mb-2">🎮</div>
                <h3 className="font-semibold mb-2">Play to Earn ELO</h3>
                <p className="text-sm text-foreground-muted">
                  Win matches to increase your rating
                </p>
              </div>

              <div className="glass rounded-xl p-8 text-center">
                <div className="text-3xl mb-2">🔒</div>
                <h3 className="font-semibold mb-2">Private Matchmaking</h3>
                <p className="text-sm text-foreground-muted">
                  Queue is hidden in TEE for fairness
                </p>
              </div>

              <div className="glass rounded-xl p-8 text-center">
                <div className="text-3xl mb-2">⚡</div>
                <h3 className="font-semibold mb-2">Instant Matches</h3>
                <p className="text-sm text-foreground-muted">
                  Get paired automatically with similar ELO
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

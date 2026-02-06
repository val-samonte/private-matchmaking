"use client";

import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { useGameSession } from "@/lib/hooks/useGameSession";
import { Choice, getWinner, isTie, formatAddress } from "@/lib/types/rps";

interface GameBoardProps {
  opponent: PublicKey;
  gameId: number;
  role: "player1" | "player2";
  onGameComplete: () => void;
}

export function GameBoard({ opponent, gameId, role, onGameComplete }: GameBoardProps) {
  const { 
    gameState, 
    playerChoice, 
    result, 
    error,
    startGame, 
    makeChoice, 
    persistResults 
  } = useGameSession();

  const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);

  // Auto-start game when component mounts
  useEffect(() => {
    if (gameState === "idle") {
      startGame(opponent, gameId, role);
    }
  }, [gameState, opponent, gameId, role, startGame]);

  const handleChoiceClick = async (choice: Choice) => {
    if (gameState !== "ready") return;
    
    setSelectedChoice(choice);
    try {
      await makeChoice(choice);
    } catch (err) {
      console.error("Failed to make choice:", err);
    }
  };

  const handlePersist = async () => {
    try {
      await persistResults();
      // Wait a bit for the transaction to settle
      setTimeout(() => {
        onGameComplete();
      }, 2000);
    } catch (err) {
      console.error("Failed to persist results:", err);
    }
  };

  const getChoiceEmoji = (choice: Choice) => {
    switch (choice) {
      case Choice.Rock: return "🪨";
      case Choice.Paper: return "📄";
      case Choice.Scissors: return "✂️";
    }
  };

  const renderContent = () => {
    // Starting/Delegating state
    if (gameState === "starting" || gameState === "delegating") {
      return (
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
          <p className="text-foreground-muted">
            {gameState === "starting" ? "Starting game..." : "Delegating to TEE..."}
          </p>
        </div>
      );
    }

    // Ready to choose
    if (gameState === "ready") {
      return (
        <div className="space-y-6">
          <p className="text-center text-foreground-muted">Make your choice!</p>
          <div className="grid grid-cols-3 gap-4">
            {Object.values(Choice).map((choice) => (
              <button
                key={choice}
                onClick={() => handleChoiceClick(choice)}
                className="glass p-8 rounded-xl hover:scale-105 transition-all hover:border-primary/50 flex flex-col items-center gap-3"
              >
                <div className="text-5xl">{getChoiceEmoji(choice)}</div>
                <div className="capitalize font-semibold">{choice}</div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Waiting for opponent
    if (gameState === "waiting_opponent" || gameState === "resolving") {
      return (
        <div className="text-center space-y-4">
          <div className="text-6xl mb-4">{selectedChoice && getChoiceEmoji(selectedChoice)}</div>
          <p className="text-xl font-semibold">You chose: {selectedChoice}</p>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
          <p className="text-foreground-muted">Waiting for opponent...</p>
        </div>
      );
    }

    // Persisting results
    if (gameState === "persisting") {
      return (
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
          <p className="text-foreground-muted">Persisting results to blockchain...</p>
        </div>
      );
    }

    // Game complete - show results
    if (gameState === "complete" && result) {
      const winner = getWinner(result);
      const tie = isTie(result);

      return (
        <div className="text-center space-y-6">
          <div className="text-6xl mb-4">
            {tie ? "🤝" : winner ? "🎉" : "❓"}
          </div>
          
          <div className="space-y-2">
            {tie ? (
              <p className="text-3xl font-bold text-warning">It's a Tie!</p>
            ) : winner ? (
              <p className="text-3xl font-bold text-success">
                {winner.equals(opponent) ? "You Lost!" : "You Won!"}
              </p>
            ) : (
              <p className="text-3xl font-bold">Game Complete</p>
            )}
          </div>

          <div className="glass rounded-xl p-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-foreground-muted">Your Choice:</span>
              <span className="text-2xl">{playerChoice && getChoiceEmoji(playerChoice)}</span>
            </div>
          </div>

          <button
            onClick={handlePersist}
            className="bg-gradient-primary text-white font-semibold py-4 px-12 rounded-xl hover:opacity-90 transition-all hover:scale-105 text-lg"
          >
            Continue
          </button>
        </div>
      );
    }

    // Error state
    if (error) {
      return (
        <div className="text-center space-y-4">
          <p className="text-error text-xl font-semibold">Error</p>
          <p className="text-foreground-muted">{error}</p>
          <button
            onClick={onGameComplete}
            className="bg-gradient-primary text-white font-semibold py-3 px-8 rounded-xl hover:opacity-90 transition-all"
          >
            Back to Menu
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="glass rounded-2xl p-8 space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold gradient-text">Rock Paper Scissors</h2>
        <p className="text-foreground-muted">
          vs {formatAddress(opponent)}
        </p>
        <p className="text-sm text-foreground-muted">Game #{gameId}</p>
      </div>

      <div className="min-h-[300px] flex items-center justify-center">
        {renderContent()}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import type { Address } from "@solana/kit";
import { useGameSession } from "@/lib/hooks/useGameSession";
import { Choice, getWinner, isTie, formatAddress } from "@/lib/types/rps";

interface GameBoardProps {
  opponent: Address;
  gameId: number;
  role: "player1" | "player2";
  onGameComplete: () => void;
}

export function GameBoard({ opponent, gameId, role, onGameComplete }: GameBoardProps) {
  const {
    gameState,
    playerChoice,
    opponentChoice,
    result,
    error,
    startGame,
    makeChoice,
    persistResults,
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
      setTimeout(() => { onGameComplete(); }, 2000);
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

    if (gameState === "complete" && result) {
      const winner = getWinner(result);
      const tie = isTie(result);
      const youWon = winner !== null && winner !== opponent;

      return (
        <div className="text-center space-y-6">
          <div className="text-6xl mb-4">
            {tie ? "🤝" : youWon ? "🎉" : "😔"}
          </div>

          <p className={`text-3xl font-bold ${tie ? "text-warning" : youWon ? "text-success" : "text-error"}`}>
            {tie ? "It&apos;s a Tie!" : youWon ? "You Won!" : "You Lost!"}
          </p>

          <div className="glass rounded-xl p-6 grid grid-cols-2 gap-6">
            <div className="text-center space-y-2">
              <div className="text-sm text-foreground-muted">You</div>
              <div className="text-5xl">{playerChoice && getChoiceEmoji(playerChoice)}</div>
              <div className="capitalize text-sm font-medium">{playerChoice}</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-sm text-foreground-muted">Opponent</div>
              <div className="text-5xl">{opponentChoice ? getChoiceEmoji(opponentChoice) : "❓"}</div>
              <div className="capitalize text-sm font-medium">{opponentChoice ?? "—"}</div>
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

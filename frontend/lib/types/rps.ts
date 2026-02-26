import type { Address } from "@solana/kit";

// Game State Machine
export type GameState =
  | "idle"
  | "searching"
  | "matched"
  | "playing"
  | "waiting"
  | "complete";

// Choice enum matching Rust program
export enum Choice {
  Rock = "rock",
  Paper = "paper",
  Scissors = "scissors",
}

// Game Result
export type GameResult =
  | { winner: Address }
  | { tie: {} }
  | { none: {} };

// Player Profile (from Rust program via Codama decoder)
export interface PlayerProfile {
  player: Address;
  elo: bigint;
  gamesPlayed: bigint;
  gamesWon: bigint;
}

// Game Session (from Rust program via Codama decoder)
export interface GameSession {
  gameId: bigint;
  player1: Address;
  player2: Address;
  player1Choice: Choice | null;
  player2Choice: Choice | null;
  result: GameResult;
}

// UI State
export interface GameUIState {
  state: GameState;
  currentGameId: bigint | null;
  opponent: Address | null;
  playerChoice: Choice | null;
  opponentChoice: Choice | null;
  result: GameResult | null;
}

// Helper to convert Choice enum to on-chain discriminated union format
export function choiceToAnchor(choice: Choice): { __kind: string } {
  const map: Record<Choice, string> = {
    [Choice.Rock]: "Rock",
    [Choice.Paper]: "Paper",
    [Choice.Scissors]: "Scissors",
  };
  return { __kind: map[choice] };
}

// Helper to parse GameResult from Codama-decoded account data
export function parseGameResult(result: any): GameResult {
  if (result?.__kind === "Winner" || result?.winner) {
    return { winner: result.winner as Address };
  } else if (result?.__kind === "Tie" || result?.tie !== undefined) {
    return { tie: {} };
  } else {
    return { none: {} };
  }
}

// Helper to determine winner from result
export function getWinner(result: GameResult): Address | null {
  if ("winner" in result) {
    return result.winner;
  }
  return null;
}

// Helper to check if game is a tie
export function isTie(result: GameResult): boolean {
  return "tie" in result;
}

// Helper to format ELO (bigint → string)
export function formatElo(elo: bigint): string {
  return elo.toString();
}

// Helper to format wallet address
export function formatAddress(addr: Address, chars: number = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

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

// Game Result enum matching Rust program
export type GameResult =
  | { winner: PublicKey }
  | { tie: {} }
  | { none: {} };

// Player Profile (from Rust program)
export interface PlayerProfile {
  player: PublicKey;
  elo: BN;
  gamesPlayed: BN;
  gamesWon: BN;
}

// Game Session (from Rust program)
export interface GameSession {
  gameId: BN;
  player1: PublicKey;
  player2: PublicKey;
  player1Choice: Choice | null;
  player2Choice: Choice | null;
  result: GameResult;
}

// UI State
export interface GameUIState {
  state: GameState;
  currentGameId: BN | null;
  opponent: PublicKey | null;
  playerChoice: Choice | null;
  opponentChoice: Choice | null;
  result: GameResult | null;
}

// Helper to convert Choice enum to Anchor format
export function choiceToAnchor(choice: Choice): Record<string, {}> {
  return { [choice]: {} };
}

// Helper to parse GameResult from Anchor
export function parseGameResult(result: any): GameResult {
  if (result.winner) {
    return { winner: new PublicKey(result.winner) };
  } else if (result.tie !== undefined) {
    return { tie: {} };
  } else {
    return { none: {} };
  }
}

// Helper to determine winner from result
export function getWinner(result: GameResult): PublicKey | null {
  if ("winner" in result) {
    return result.winner;
  }
  return null;
}

// Helper to check if game is a tie
export function isTie(result: GameResult): boolean {
  return "tie" in result;
}

// Helper to format ELO
export function formatElo(elo: BN): string {
  return elo.toString();
}

// Helper to format wallet address
export function formatAddress(address: PublicKey, chars: number = 4): string {
  const str = address.toBase58();
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

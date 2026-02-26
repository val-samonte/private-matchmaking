import { atom } from "jotai";
import type { Address } from "@solana/kit";
import type { GameState, Choice, GameResult } from "../types/rps";

/**
 * Game state atom
 */
export const gameStateAtom = atom<GameState>("idle");

/**
 * Current game ID atom (bigint for u64)
 */
export const currentGameIdAtom = atom<bigint | null>(null);

/**
 * Opponent address atom
 */
export const opponentAtom = atom<Address | null>(null);

/**
 * Player's choice atom
 */
export const playerChoiceAtom = atom<Choice | null>(null);

/**
 * Opponent's choice atom (only visible after game completes)
 */
export const opponentChoiceAtom = atom<Choice | null>(null);

/**
 * Game result atom
 */
export const gameResultAtom = atom<GameResult | null>(null);

/**
 * Is searching for match atom
 */
export const isSearchingAtom = atom((get) => {
  const state = get(gameStateAtom);
  return state === "searching";
});

/**
 * Is in active game atom
 */
export const isInGameAtom = atom((get) => {
  const state = get(gameStateAtom);
  return state === "playing" || state === "waiting" || state === "matched";
});

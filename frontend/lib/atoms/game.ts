import { atom } from "jotai";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { GameState, Choice, GameResult } from "../types/rps";

/**
 * Game state atom
 */
export const gameStateAtom = atom<GameState>("idle");

/**
 * Current game ID atom
 */
export const currentGameIdAtom = atom<BN | null>(null);

/**
 * Opponent public key atom
 */
export const opponentAtom = atom<PublicKey | null>(null);

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

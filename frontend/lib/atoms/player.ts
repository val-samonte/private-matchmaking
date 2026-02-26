import { atom } from "jotai";
import type { Address } from "@solana/kit";
import { walletAtom } from "./wallet";
import { derivePlayerProfilePda } from "../utils/pda";
import type { PlayerProfile } from "../types/rps";

/**
 * Player Profile PDA atom (async — derived from wallet)
 */
export const playerProfilePdaAtom = atom(async (get): Promise<Address | null> => {
  const wallet = get(walletAtom);
  if (!wallet) return null;
  const [pda] = await derivePlayerProfilePda(wallet);
  return pda;
});

/**
 * Player Profile data atom
 */
export const playerProfileAtom = atom<PlayerProfile | null>(null);

/**
 * Has Profile atom (derived from player profile)
 */
export const hasProfileAtom = atom((get) => {
  const profile = get(playerProfileAtom);
  return profile !== null;
});

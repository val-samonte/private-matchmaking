import { atom } from "jotai";
import { PublicKey } from "@solana/web3.js";
import { walletAtom } from "./wallet";
import { derivePlayerProfilePda } from "../utils/pda";
import { PlayerProfile } from "../types/rps";

/**
 * Player Profile PDA atom (derived from wallet)
 */
export const playerProfilePdaAtom = atom((get) => {
  const wallet = get(walletAtom);
  if (!wallet) return null;
  const [pda] = derivePlayerProfilePda(wallet);
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

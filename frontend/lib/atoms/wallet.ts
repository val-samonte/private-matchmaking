import { atom } from "jotai";
import { PublicKey } from "@solana/web3.js";

/**
 * Wallet public key atom
 */
export const walletAtom = atom<PublicKey | null>(null);

/**
 * Wallet connected state atom
 */
export const walletConnectedAtom = atom<boolean>(false);

import { atom } from "jotai";
import type { Address } from "@solana/kit";

/**
 * Wallet address atom (Kit Address = string brand)
 */
export const walletAtom = atom<Address | null>(null);

/**
 * Wallet connected state atom
 */
export const walletConnectedAtom = atom<boolean>(false);

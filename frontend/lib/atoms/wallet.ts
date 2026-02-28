import { atom } from "jotai";
import type { Address } from "@solana/kit";
import type { KitWallet } from "@/lib/utils/wallet-bridge";

/**
 * Wallet address atom (Kit Address = branded string)
 */
export const walletAtom = atom<Address | null>(null);

/**
 * Full wallet object atom — used for signing transactions without going through React Context.
 * Set alongside walletAtom on connect; cleared on disconnect.
 */
export const kitWalletAtom = atom<KitWallet | null>(null);

/**
 * Derived: true when a wallet is connected
 */
export const walletConnectedAtom = atom((get) => get(walletAtom) !== null);

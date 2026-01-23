import { atom } from "jotai";
import { PublicKey } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

// Core Wallet State
export const walletPublicKeyAtom = atom<PublicKey | null>(null);
export const walletConnectedAtom = atom<boolean>(false);
export const walletNetworkAtom = atom<WalletAdapterNetwork>(WalletAdapterNetwork.Devnet);

// Derived State
export const isWalletReadyAtom = atom(
  (get) => get(walletConnectedAtom) && !!get(walletPublicKeyAtom)
);

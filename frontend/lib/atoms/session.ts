import { atom } from "jotai";
import type { KeyPairSigner } from "@solana/kit";
import { sessionKeyToKitWallet } from "@/lib/utils/session";

/**
 * The active ephemeral session keypair.
 * Null until createSession() is called; cleared on wallet disconnect.
 */
export const sessionSignerAtom = atom<KeyPairSigner | null>(null);

/**
 * Derived: KitWallet wrapper around the session key for signing TEE transactions.
 * Null when no session is active.
 */
export const sessionKitWalletAtom = atom((get) => {
  const signer = get(sessionSignerAtom);
  return signer ? sessionKeyToKitWallet(signer) : null;
});

/**
 * Derived: true when a session key is active in memory
 */
export const isSessionActiveAtom = atom((get) => get(sessionSignerAtom) !== null);

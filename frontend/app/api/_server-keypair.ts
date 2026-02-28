/**
 * Server-side keypair loader.
 * Loaded once from SERVER_PRIVATE_KEY env var; cached for the process lifetime.
 *
 * SERVER_PRIVATE_KEY accepts two formats:
 *   - JSON array: "[1,2,3,...,64]"  (output of `solana-keygen new`)
 *   - Comma-separated: "1,2,3,...,64"
 *
 * The keypair is expected to be the QUEUE_AUTHORITY keypair (64 bytes: 32 secret + 32 public).
 * This is also the identity used as "server" for relay transactions.
 */

import {
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  type KeyPairSigner,
} from "@solana/kit";

let cachedKeypair: KeyPairSigner | null = null;

export async function getServerKeypair(): Promise<KeyPairSigner> {
  if (cachedKeypair) return cachedKeypair;

  const raw = process.env.SERVER_PRIVATE_KEY;
  if (!raw) {
    throw new Error("SERVER_PRIVATE_KEY env var is not set");
  }

  let bytes: Uint8Array;

  if (raw.startsWith("[")) {
    // JSON array format: [1,2,...,64]
    const arr = JSON.parse(raw) as number[];
    bytes = new Uint8Array(arr);
  } else if (raw.includes(",")) {
    // Comma-separated: 1,2,...,64
    bytes = new Uint8Array(raw.split(",").map(Number));
  } else {
    // Base58 encoded
    bytes = Uint8Array.from(getBase58Encoder().encode(raw));
  }

  cachedKeypair = await createKeyPairSignerFromBytes(bytes);
  return cachedKeypair;
}

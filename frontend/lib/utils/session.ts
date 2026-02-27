"use client";

import {
  generateKeyPairSigner,
  getProgramDerivedAddress,
  getAddressEncoder,
  getUtf8Encoder,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  pipe,
  AccountRole,
  type Address,
  type KeyPairSigner,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import type { KitWallet } from "./wallet-bridge";

export const GUM_SESSION_KEYS_PROGRAM =
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5" as Address;

// create_session discriminator = sha256("global:create_session")[0..8]
const CREATE_SESSION_DISCRIMINATOR = new Uint8Array([242, 193, 143, 179, 150, 25, 122, 227]);

/**
 * SOL transferred to the session key when a session is created.
 * Covers ~100 TEE game-move transactions at ~5 000 lamports each.
 */
export const SESSION_FUND_LAMPORTS = 500_000n; // 0.0005 SOL

/** System Program transfer instruction — no external package required. */
function buildSystemTransferInstruction(
  from: Address,
  to: Address,
  lamports: bigint,
): Instruction {
  // System Program Transfer opcode = 2 (u32 LE), followed by lamports (u64 LE)
  const data = new Uint8Array(12);
  new DataView(data.buffer).setUint32(0, 2, true);
  new DataView(data.buffer).setBigUint64(4, lamports, true);
  return {
    programAddress: "11111111111111111111111111111111" as Address,
    data,
    accounts: [
      { address: from, role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
    ],
  };
}

/**
 * Derive the Gum SessionToken PDA.
 * Seeds: ["session_token", target_program, session_signer, authority]
 * Program: GUM_SESSION_KEYS_PROGRAM
 */
export async function deriveSessionTokenPda(
  targetProgram: Address,
  sessionSigner: Address,
  authority: Address,
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: GUM_SESSION_KEYS_PROGRAM,
    seeds: [
      getUtf8Encoder().encode("session_token"),
      getAddressEncoder().encode(targetProgram),
      getAddressEncoder().encode(sessionSigner),
      getAddressEncoder().encode(authority),
    ],
  });
  return pda;
}

/**
 * Build the create_session instruction.
 * Requires two signers: authority (wallet, payer) AND session_signer (ephemeral key).
 * Use sendCreateSessionTx() which handles the dual-signature flow.
 */
export function buildCreateSessionInstruction(
  sessionTokenPda: Address,
  sessionSigner: Address,
  authority: Address,
  targetProgram: Address,
  validUntil: bigint,
): Instruction {
  // Instruction data: [discriminator (8 bytes)][valid_until i64 LE (8 bytes)]
  const data = new Uint8Array(16);
  data.set(CREATE_SESSION_DISCRIMINATOR, 0);
  new DataView(data.buffer).setBigInt64(8, validUntil, true);

  return {
    programAddress: GUM_SESSION_KEYS_PROGRAM,
    data,
    accounts: [
      { address: sessionTokenPda, role: AccountRole.WRITABLE },          // init PDA
      { address: sessionSigner, role: AccountRole.READONLY_SIGNER },     // proves possession
      { address: authority, role: AccountRole.WRITABLE_SIGNER },         // fee payer
      { address: targetProgram, role: AccountRole.READONLY },            // executable account
      { address: "11111111111111111111111111111111" as Address, role: AccountRole.READONLY },
    ],
  };
}

/**
 * Adapt a KeyPairSigner to the KitWallet interface.
 * This enables the existing sendInstruction() to sign transactions with an
 * ephemeral session key instead of the browser wallet — no popup required.
 *
 * Assumes single-signer transactions (one fee payer = session key).
 * Wire format: [0x01][64-byte sig slot][message bytes]
 */
export function sessionKeyToKitWallet(signer: KeyPairSigner): KitWallet {
  return {
    address: signer.address,

    async signTransaction(wireBytes: Uint8Array): Promise<Uint8Array> {
      // Single-signer wire format: offset 0 = 0x01, offsets 1..65 = sig, 65.. = message
      const messageBytes = wireBytes.slice(1 + 64);
      const sigBytes = await crypto.subtle.sign(
        "Ed25519",
        signer.keyPair.privateKey,
        messageBytes,
      );
      const result = new Uint8Array(wireBytes);
      result.set(new Uint8Array(sigBytes), 1);
      return result;
    },

    async signAllTransactions(txs: Uint8Array[]): Promise<Uint8Array[]> {
      return Promise.all(txs.map((tx) => this.signTransaction(tx)));
    },

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sigBytes = await crypto.subtle.sign("Ed25519", signer.keyPair.privateKey, message as any);
      return new Uint8Array(sigBytes);
    },
  };
}

/**
 * Send the create_session transaction requiring two signatures:
 * 1. Wallet (authority + fee payer) — triggers one browser wallet popup
 * 2. Session key (proves possession of ephemeral keypair) — signed in-memory, no popup
 *
 * Wire format with 2 signers: [0x02][64 wallet sig][64 session sig][message]
 */
export async function sendCreateSessionTx(
  rpc: Rpc<SolanaRpcApi>,
  sessionKey: KeyPairSigner,
  wallet: KitWallet,
  targetProgram: Address,
  durationSeconds: number,
): Promise<string> {
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + durationSeconds);
  const sessionTokenPda = await deriveSessionTokenPda(
    targetProgram,
    sessionKey.address,
    wallet.address as Address,
  );
  const ix = buildCreateSessionInstruction(
    sessionTokenPda,
    sessionKey.address,
    wallet.address as Address,
    targetProgram,
    validUntil,
  );

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const fundIx = buildSystemTransferInstruction(
    wallet.address as Address,
    sessionKey.address,
    SESSION_FUND_LAMPORTS,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg: any = pipe(
    createTransactionMessage({ version: 0 as const }),
    (m) => setTransactionMessageFeePayer(wallet.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(ix, m),
    (m) => appendTransactionMessageInstruction(fundIx, m),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unsignedTx = compileTransaction(msg as any);
  const wireBase64 = getBase64EncodedWireTransaction(unsignedTx);
  const wireBytes = Uint8Array.from(getBase64Encoder().encode(wireBase64));

  // TX has 2 signers ordered as: [authority (fee payer), session_signer]
  // Wire layout: [0x02][64 wallet_sig][64 session_sig][message_bytes]
  const messageBytes = wireBytes.slice(1 + 2 * 64);
  const sessionSigBytes = new Uint8Array(
    await crypto.subtle.sign("Ed25519", sessionKey.keyPair.privateKey, messageBytes),
  );

  // Pre-fill session key sig at slot 1 (bytes 65..129)
  const partiallySignedWire = new Uint8Array(wireBytes);
  partiallySignedWire.set(sessionSigBytes, 1 + 64);

  // Wallet signs — fills its own slot 0 (bytes 1..65); slot 1 remains intact
  const fullySignedWire = await wallet.signTransaction(partiallySignedWire);

  const signedBase64 = btoa(String.fromCharCode(...fullySignedWire));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rpc.sendTransaction(signedBase64 as any, {
    encoding: "base64",
    skipPreflight: true,
  }).send() as Promise<string>;
}

export { generateKeyPairSigner };

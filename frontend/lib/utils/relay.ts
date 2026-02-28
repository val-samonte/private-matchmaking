"use client";

/**
 * relay.ts — Send a transaction where the session key signs in-memory (slot 1)
 * and the server pays fees (slot 0) via /api/relay.
 *
 * The TX must have exactly 2 required signers:
 *   Slot 0: serverAddress (fee payer) — server signs server-side
 *   Slot 1: sessionKey   — signed here, sent as partial TX
 */

import {
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  pipe,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";

/**
 * Build a 2-signer transaction, pre-sign slot 1 (session key), POST to /api/relay.
 * Server fills slot 0 (fee payer) and submits.
 *
 * @param rpc            L1 RPC for fetching recent blockhash
 * @param instructions   Instructions to include in the TX
 * @param sessionSigner  Session key keypair (signs slot 1, no popup)
 * @param serverAddress  Fee payer address (server signs this slot via relay API)
 * @returns signature string
 */
export async function relayTx(
  rpc: Rpc<SolanaRpcApi>,
  instructions: Instruction[],
  sessionSigner: KeyPairSigner,
  serverAddress: Address,
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // Build TX with server as fee payer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any = pipe(
    createTransactionMessage({ version: 0 as const }),
    (m) => setTransactionMessageFeePayer(serverAddress, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  );
  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix, msg);
  }

  const unsignedTx = compileTransaction(msg as Parameters<typeof compileTransaction>[0]);
  const wireBase64 = getBase64EncodedWireTransaction(unsignedTx);
  const wireBytes = Uint8Array.from(getBase64Encoder().encode(wireBase64));

  // Wire layout for 2-signer TX: [0x02][server_sig (zeros)][session_sig][message]
  //   Slot 0 = server  → offset 1
  //   Slot 1 = session  → offset 1 + 64 = 65
  const messageBytes = wireBytes.slice(1 + 2 * 64);
  const sessionSigBytes = new Uint8Array(
    await crypto.subtle.sign("Ed25519", sessionSigner.keyPair.privateKey, messageBytes),
  );

  const partialWire = new Uint8Array(wireBytes);
  partialWire.set(sessionSigBytes, 1 + 64); // slot 1

  const partialBase64 = btoa(String.fromCharCode(...partialWire));

  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partialTx: partialBase64 }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Relay failed: ${(body as { error: string }).error}`);
  }

  const { signature } = (await res.json()) as { signature: string };
  return signature;
}

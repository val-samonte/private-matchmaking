/**
 * POST /api/relay
 *
 * Accepts a partially-signed transaction where:
 *   - Slot 0 (fee payer): server — unsigned (zero-filled)
 *   - Slot 1: session key — already signed by client
 *
 * Security checks:
 *   1. Fee payer in the message must equal the server's address
 *   2. Server signs slot 0 and submits
 *
 * Body: { partialTx: string }  (base64 wire transaction)
 * Returns: { signature: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createSolanaRpc,
  getBase58Decoder,
  type Address,
} from "@solana/kit";
import { getServerKeypair } from "../_server-keypair";

const L1_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

/** Parse compact-u16 (Solana wire format). Returns [value, bytesConsumed]. */
function readCompactU16(buf: Uint8Array, offset: number): [number, number] {
  let val = 0;
  let shift = 0;
  let i = offset;
  while (true) {
    const byte = buf[i++];
    val |= (byte & 0x7f) << shift;
    shift += 7;
    if (!(byte & 0x80)) break;
  }
  return [val, i - offset];
}

/** Extract the fee-payer address (base58) from the raw wire bytes of a versioned TX. */
function extractFeePayer(wireBytes: Uint8Array): string {
  // Wire format: [numSigs u8][sigs...][message]
  const numSigs = wireBytes[0];
  const msgStart = 1 + numSigs * 64;
  const msg = wireBytes.slice(msgStart);

  // Skip 3-byte header
  let pos = 3;
  // Skip compact-u16 account count
  const [, countLen] = readCompactU16(msg, pos);
  pos += countLen;

  // First 32 bytes of account keys = fee payer
  const feePayerBytes = msg.slice(pos, pos + 32);
  return getBase58Decoder().decode(feePayerBytes);
}

export async function POST(req: NextRequest) {
  try {
    const { partialTx } = (await req.json()) as { partialTx: string };
    if (!partialTx) {
      return NextResponse.json({ error: "Missing partialTx" }, { status: 400 });
    }

    const server = await getServerKeypair();

    // Decode base64 wire bytes
    const wireBytes = Uint8Array.from(
      atob(partialTx)
        .split("")
        .map((c) => c.charCodeAt(0))
    );

    // Security: verify fee payer == server
    const feePayer = extractFeePayer(wireBytes);
    if (feePayer !== server.address) {
      return NextResponse.json(
        { error: `Fee payer mismatch: expected ${server.address}, got ${feePayer}` },
        { status: 403 }
      );
    }

    // TX layout for 2-signer TX: [0x02][server_sig (zeros)][session_sig][message]
    const numSigs = wireBytes[0];
    if (numSigs !== 2) {
      return NextResponse.json(
        { error: `Expected 2 signers, got ${numSigs}` },
        { status: 400 }
      );
    }

    // Extract message bytes (starts after all sigs)
    const messageBytes = wireBytes.slice(1 + 2 * 64);

    // Server signs slot 0
    const serverSigBytes = new Uint8Array(
      await crypto.subtle.sign("Ed25519", server.keyPair.privateKey, messageBytes)
    );

    const fullySignedWire = new Uint8Array(wireBytes);
    fullySignedWire.set(serverSigBytes, 1); // slot 0 = offset 1

    // Submit
    const rpc = createSolanaRpc(L1_RPC_URL);
    const signedBase64 = btoa(String.fromCharCode(...fullySignedWire));
    const signature = await (
      rpc.sendTransaction(signedBase64 as unknown as Parameters<typeof rpc.sendTransaction>[0], {
        encoding: "base64",
        skipPreflight: true,
      }) as ReturnType<typeof rpc.sendTransaction>
    ).send() as unknown as string;

    return NextResponse.json({ signature });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[relay] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

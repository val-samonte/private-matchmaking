/**
 * POST /api/persist
 *
 * Server authenticates with TEE and submits persist_results on behalf of players.
 * Server is the fee payer for this TEE transaction.
 *
 * Body: { player1: string, player2: string, gameId: string }
 * Returns: { signature: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createSolanaRpc,
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
  type Address,
  type Instruction,
} from "@solana/kit";
import { getServerKeypair } from "../_server-keypair";
import { getPersistResultsInstruction } from "@sdk/generated/rps-game";
import { getAuthToken } from "@sdk/tee";

const TEE_RPC_URL =
  process.env.NEXT_PUBLIC_TEE_RPC_URL || "https://tee.magicblock.app";
const RPS_GAME_PROGRAM_ID =
  (process.env.NEXT_PUBLIC_RPS_PROGRAM_ID ||
    "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos") as Address;

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();

async function derivePlayerProfilePda(player: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: RPS_GAME_PROGRAM_ID,
    seeds: [
      utf8Encoder.encode("player_profile_v35"),
      addressEncoder.encode(player),
    ],
  });
  return pda;
}

async function deriveGameSessionPda(
  player1: Address,
  player2: Address,
  gameId: bigint
): Promise<Address> {
  const gameIdBytes = new Uint8Array(8);
  let n = gameId;
  for (let i = 0; i < 8; i++) {
    gameIdBytes[i] = Number(n & BigInt(0xff));
    n >>= BigInt(8);
  }
  const [pda] = await getProgramDerivedAddress({
    programAddress: RPS_GAME_PROGRAM_ID,
    seeds: [
      utf8Encoder.encode("game_session_v1"),
      addressEncoder.encode(player1),
      addressEncoder.encode(player2),
      gameIdBytes,
    ],
  });
  return pda;
}

export async function POST(req: NextRequest) {
  try {
    const {
      player1: player1Str,
      player2: player2Str,
      gameId: gameIdStr,
    } = (await req.json()) as {
      player1: string;
      player2: string;
      gameId: string;
    };

    if (!player1Str || !player2Str || !gameIdStr) {
      return NextResponse.json(
        { error: "Missing player1, player2, or gameId" },
        { status: 400 }
      );
    }

    const server = await getServerKeypair();
    const player1 = player1Str as Address;
    const player2 = player2Str as Address;
    const gameId = BigInt(gameIdStr);

    // Derive PDAs server-side
    const gameSessionPda = await deriveGameSessionPda(player1, player2, gameId);
    const player1ProfilePda = await derivePlayerProfilePda(player1);
    const player2ProfilePda = await derivePlayerProfilePda(player2);

    // Authenticate with TEE using server keypair
    const { token } = await getAuthToken(TEE_RPC_URL, server);
    const teeRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${token}`);

    const persistIx = getPersistResultsInstruction({
      gameSession: gameSessionPda,
      player1Profile: player1ProfilePda,
      player2Profile: player2ProfilePda,
      payer: server,
    });

    const { value: latestBlockhash } = await teeRpc.getLatestBlockhash().send();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg: any = pipe(
      createTransactionMessage({ version: 0 as const }),
      (m) => setTransactionMessageFeePayer(server.address, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(persistIx as unknown as Instruction, m)
    );

    const unsignedTx = compileTransaction(msg as Parameters<typeof compileTransaction>[0]);
    const wireBase64 = getBase64EncodedWireTransaction(unsignedTx);
    const wireBytes = Uint8Array.from(getBase64Encoder().encode(wireBase64));

    // Single signer: [0x01][server_sig][message]
    const messageBytes = wireBytes.slice(1 + 64);
    const serverSig = new Uint8Array(
      await crypto.subtle.sign("Ed25519", server.keyPair.privateKey, messageBytes)
    );
    const signed = new Uint8Array(wireBytes);
    signed.set(serverSig, 1);

    const signedBase64 = btoa(String.fromCharCode(...signed));
    const signature = await (
      teeRpc.sendTransaction(
        signedBase64 as unknown as Parameters<typeof teeRpc.sendTransaction>[0],
        { encoding: "base64", skipPreflight: true }
      ) as ReturnType<typeof teeRpc.sendTransaction>
    ).send() as unknown as string;

    return NextResponse.json({ signature });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[persist] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

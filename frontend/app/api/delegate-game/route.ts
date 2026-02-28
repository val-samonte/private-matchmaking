/**
 * POST /api/delegate-game
 *
 * Server builds, signs, and submits delegate_pda for a GameSession PDA.
 * Server is the sole signer (payer).
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

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();
import { getServerKeypair } from "../_server-keypair";
import { getDelegatePdaInstructionAsync } from "@sdk/generated/rps-game";
import { accountType as rpsAccountType } from "@sdk/generated/rps-game/types";

const L1_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const RPS_GAME_PROGRAM_ID =
  (process.env.NEXT_PUBLIC_RPS_PROGRAM_ID ||
    "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos") as Address;
const ER_VALIDATOR = (process.env.NEXT_PUBLIC_ER_VALIDATOR ||
  "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA") as Address;

export async function POST(req: NextRequest) {
  try {
    const { player1, player2, gameId: gameIdStr } = (await req.json()) as {
      player1: string;
      player2: string;
      gameId: string;
    };
    if (!player1 || !player2 || !gameIdStr) {
      return NextResponse.json(
        { error: "Missing player1, player2, or gameId" },
        { status: 400 }
      );
    }

    const server = await getServerKeypair();
    const gameId = BigInt(gameIdStr);

    // Derive game session PDA using the same seeds as the rps-game program
    // seeds: [GAME_SESSION_SEED, p1, p2, gameId_le_bytes]

    const rpc = createSolanaRpc(L1_RPC_URL);
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const delegateIx = await getDelegatePdaInstructionAsync(
      {
        pda: await deriveGameSessionPda(
          player1 as Address,
          player2 as Address,
          gameId,
        ),
        payer: server,
        validator: ER_VALIDATOR,
        accountType: rpsAccountType("GameSession", {
          p1: player1 as Address,
          p2: player2 as Address,
          id: gameId,
        }),
      },
      { programAddress: RPS_GAME_PROGRAM_ID }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg: any = pipe(
      createTransactionMessage({ version: 0 as const }),
      (m) => setTransactionMessageFeePayer(server.address, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(delegateIx as unknown as Instruction, m)
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
      rpc.sendTransaction(
        signedBase64 as unknown as Parameters<typeof rpc.sendTransaction>[0],
        { encoding: "base64", skipPreflight: true }
      ) as ReturnType<typeof rpc.sendTransaction>
    ).send() as unknown as string;

    return NextResponse.json({ signature });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[delegate-game] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Derive GameSession PDA (mirrors rps-game program seeds). */
async function deriveGameSessionPda(
  player1: Address,
  player2: Address,
  gameId: bigint,
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

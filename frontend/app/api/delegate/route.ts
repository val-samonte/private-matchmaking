/**
 * POST /api/delegate
 *
 * Server builds, signs, and submits:
 *   1. DelegatePermission (server signs as payer AND authority — server = queue authority = Permission member)
 *   2. delegate_ticket (server pays, uses duel program)
 *
 * Body: { playerAddress: string }
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
  AccountRole,
  type Address,
  type Instruction,
} from "@solana/kit";
import { getServerKeypair } from "../_server-keypair";
import { getDelegateTicketInstructionAsync } from "@sdk/generated/duel";
import { accountType } from "@sdk/generated/duel/types";

const L1_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DUEL_PROGRAM_ID =
  (process.env.NEXT_PUBLIC_DUEL_PROGRAM_ID ||
    "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X") as Address;
const QUEUE_AUTHORITY = (process.env.NEXT_PUBLIC_QUEUE_AUTHORITY ||
  "Fh68kkXwFDubEdkRRBuWCXBdTr2YtnM52ASA7fxHrbCw") as Address;
const ER_VALIDATOR = (process.env.NEXT_PUBLIC_ER_VALIDATOR ||
  "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA") as Address;

const PERMISSION_PROGRAM =
  "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1" as Address;
const DELEGATION_PROGRAM =
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh" as Address;
const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();

async function deriveTenantPda(authority: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: DUEL_PROGRAM_ID,
    seeds: [utf8Encoder.encode("tenant"), addressEncoder.encode(authority)],
  });
  return pda;
}

async function deriveTicketPda(
  player: Address,
  tenant: Address
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: DUEL_PROGRAM_ID,
    seeds: [
      utf8Encoder.encode("ticket"),
      addressEncoder.encode(player),
      addressEncoder.encode(tenant),
    ],
  });
  return pda;
}

async function derivePermissionPda(account: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PERMISSION_PROGRAM,
    seeds: [utf8Encoder.encode("permission:"), addressEncoder.encode(account)],
  });
  return pda;
}

async function derivePermissionDelegationPdas(permissionPda: Address) {
  const [delegationRecord] = await getProgramDerivedAddress({
    programAddress: DELEGATION_PROGRAM,
    seeds: [
      utf8Encoder.encode("delegation"),
      addressEncoder.encode(permissionPda),
    ],
  });
  const [delegationMetadata] = await getProgramDerivedAddress({
    programAddress: DELEGATION_PROGRAM,
    seeds: [
      utf8Encoder.encode("delegation-metadata"),
      addressEncoder.encode(permissionPda),
    ],
  });
  const [delegationBuffer] = await getProgramDerivedAddress({
    programAddress: PERMISSION_PROGRAM,
    seeds: [
      utf8Encoder.encode("buffer"),
      addressEncoder.encode(permissionPda),
    ],
  });
  return { delegationBuffer, delegationRecord, delegationMetadata };
}

async function signAndSend(
  instructions: Instruction[],
  serverWireSign: (msg: Uint8Array) => Promise<Uint8Array>
): Promise<string> {
  const rpc = createSolanaRpc(L1_RPC_URL);
  const server = await getServerKeypair();
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any = pipe(
    createTransactionMessage({ version: 0 as const }),
    (m) => setTransactionMessageFeePayer(server.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m)
  );
  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix, msg);
  }

  const unsignedTx = compileTransaction(msg as Parameters<typeof compileTransaction>[0]);
  const wireBase64 = getBase64EncodedWireTransaction(unsignedTx);
  const wireBytes = Uint8Array.from(getBase64Encoder().encode(wireBase64));

  // Single signer: [0x01][server_sig][message]
  const messageBytes = wireBytes.slice(1 + 64);
  const serverSig = await serverWireSign(messageBytes);
  const signed = new Uint8Array(wireBytes);
  signed.set(serverSig, 1);

  const signedBase64 = btoa(String.fromCharCode(...signed));
  return (rpc.sendTransaction(
    signedBase64 as unknown as Parameters<typeof rpc.sendTransaction>[0],
    { encoding: "base64", skipPreflight: true }
  ) as ReturnType<typeof rpc.sendTransaction>).send() as unknown as string;
}

export async function POST(req: NextRequest) {
  try {
    const { playerAddress } = (await req.json()) as { playerAddress: string };
    if (!playerAddress) {
      return NextResponse.json({ error: "Missing playerAddress" }, { status: 400 });
    }

    const server = await getServerKeypair();
    const player = playerAddress as Address;

    // Re-derive all PDAs server-side (never trust client-provided addresses)
    const tenantPda = await deriveTenantPda(QUEUE_AUTHORITY);
    const ticketPda = await deriveTicketPda(player, tenantPda);
    const permissionPda = await derivePermissionPda(ticketPda);
    const { delegationBuffer, delegationRecord, delegationMetadata } =
      await derivePermissionDelegationPdas(permissionPda);

    // DelegatePermission instruction (discriminator: [3,0,0,0,0,0,0,0])
    // Account[0] = payer (server, WRITABLE_SIGNER)
    // Account[1] = authority (server = queue authority, which IS a Permission member)
    const delegatePermIx: Instruction = {
      programAddress: PERMISSION_PROGRAM,
      data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]),
      accounts: [
        { address: server.address, role: AccountRole.WRITABLE_SIGNER }, // payer
        { address: server.address, role: AccountRole.READONLY_SIGNER }, // authority (queue authority = server)
        { address: ticketPda, role: AccountRole.READONLY },             // permissioned_account
        { address: permissionPda, role: AccountRole.WRITABLE },         // permission PDA
        { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
        { address: PERMISSION_PROGRAM, role: AccountRole.READONLY },
        { address: delegationBuffer, role: AccountRole.WRITABLE },
        { address: delegationRecord, role: AccountRole.WRITABLE },
        { address: delegationMetadata, role: AccountRole.WRITABLE },
        { address: DELEGATION_PROGRAM, role: AccountRole.READONLY },
        { address: ER_VALIDATOR, role: AccountRole.READONLY },
      ],
    };

    // delegate_ticket instruction (server pays)
    const delegateTicketIx = await getDelegateTicketInstructionAsync(
      {
        pda: ticketPda,
        payer: server,
        validator: ER_VALIDATOR,
        accountType: accountType("Ticket", { player, tenant: tenantPda }),
      },
      { programAddress: DUEL_PROGRAM_ID }
    );

    const signature = await signAndSend(
      [delegatePermIx, delegateTicketIx as unknown as Instruction],
      (msg) =>
        crypto.subtle
          .sign("Ed25519", server.keyPair.privateKey, new Uint8Array(msg))
          .then((b) => new Uint8Array(b))
    );

    return NextResponse.json({ signature });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[delegate] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

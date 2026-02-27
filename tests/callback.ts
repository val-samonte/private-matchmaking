import { assert } from "chai";
import { readFileSync } from "fs";
import { homedir } from "os";
import {
  generateKeyPairSigner,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getProgramDerivedAddress,
  getAddressEncoder,
  getUtf8Encoder,
  AccountRole,
  type Address,
  type KeyPairSigner,
  type Instruction,
} from "@solana/kit";
import * as crypto from "crypto";

import { MatchmakingAdmin } from "../sdk/src/admin.js";
import { MatchmakingPlayer } from "../sdk/src/player.js";
import { getAuthToken } from "../sdk/src/tee.js";
import { sendInstruction } from "../sdk/src/transaction.js";

import {
  getInitializePlayerInstructionAsync,
  getDelegatePdaInstructionAsync,
} from "../sdk/src/generated/rps-game/index.js";
import { accountType as rpsAccountType } from "../sdk/src/generated/rps-game/types/accountType.js";
import { fetchMaybeMatchTicket } from "../sdk/src/generated/duel/index.js";

const DUEL_PROGRAM_ID = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X" as Address;
const RPS_GAME_PROGRAM_ID = "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos" as Address;
const ER_VALIDATOR = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA" as Address;

const TEE_RPC_URL = "https://tee.magicblock.app";
const L1_RPC_URL = "https://api.devnet.solana.com";

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();


describe("callback-via-tenant-pda", () => {
  const l1Rpc = createSolanaRpc(L1_RPC_URL);

  let payer: KeyPairSigner;
  let player1: KeyPairSigner;
  let player2: KeyPairSigner;
  let queueAuthority: KeyPairSigner;

  let queuePda: Address;
  let tenantPda: Address;
  let p2TicketPda: Address;
  let p1ProfilePda: Address;
  let p2ProfilePda: Address;

  let token1: string;
  let token2: string;
  let tokenQ: string;

  before("Generate fresh keypairs and fund", async () => {
    const payerBytes = new Uint8Array(
      JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf-8"))
    );
    payer = await createKeyPairSignerFromBytes(payerBytes);
    player1 = await generateKeyPairSigner();
    player2 = await generateKeyPairSigner();
    queueAuthority = await generateKeyPairSigner();

    const LAMPORTS = 100_000_000n;
    const { sendInstructions } = await import("../sdk/src/transaction.js");
    await sendInstructions(
      l1Rpc,
      [player1, player2, queueAuthority].map((dest) => {
        const buf = new Uint8Array(12);
        new DataView(buf.buffer).setUint32(0, 2, true);
        new DataView(buf.buffer).setBigUint64(4, LAMPORTS, true);
        return {
          programAddress: "11111111111111111111111111111111" as Address,
          accounts: [
            { address: payer.address, role: AccountRole.WRITABLE_SIGNER },
            { address: dest.address, role: AccountRole.WRITABLE },
          ],
          data: buf,
        } satisfies Instruction;
      }),
      payer,
    );
    await new Promise((r) => setTimeout(r, 2000));

    const [tPda] = await getProgramDerivedAddress({
      programAddress: DUEL_PROGRAM_ID,
      seeds: [utf8Encoder.encode("tenant"), addressEncoder.encode(queueAuthority.address)],
    });
    tenantPda = tPda;

    const [qPda] = await getProgramDerivedAddress({
      programAddress: DUEL_PROGRAM_ID,
      seeds: [utf8Encoder.encode("queue"), addressEncoder.encode(queueAuthority.address)],
    });
    queuePda = qPda;

    const [t2Pda] = await getProgramDerivedAddress({
      programAddress: DUEL_PROGRAM_ID,
      seeds: [
        utf8Encoder.encode("ticket"),
        addressEncoder.encode(player2.address),
        addressEncoder.encode(tenantPda),
      ],
    });
    p2TicketPda = t2Pda;

    const [prof1Pda] = await getProgramDerivedAddress({
      programAddress: RPS_GAME_PROGRAM_ID,
      seeds: [utf8Encoder.encode("player_profile_v35"), addressEncoder.encode(player1.address)],
    });
    p1ProfilePda = prof1Pda;

    const [prof2Pda] = await getProgramDerivedAddress({
      programAddress: RPS_GAME_PROGRAM_ID,
      seeds: [utf8Encoder.encode("player_profile_v35"), addressEncoder.encode(player2.address)],
    });
    p2ProfilePda = prof2Pda;

    const auth1 = await getAuthToken(TEE_RPC_URL, player1);
    token1 = auth1.token;
    const auth2 = await getAuthToken(TEE_RPC_URL, player2);
    token2 = auth2.token;
    const authQ = await getAuthToken(TEE_RPC_URL, queueAuthority);
    tokenQ = authQ.token;

    console.log("Callback test: fresh keypairs funded");
  });

  it("Initialize Tenant & Queue with callback, Delegate", async () => {
    const callbackDiscriminator = Array.from(
      crypto.createHash("sha256").update("global:on_match_found").digest().slice(0, 8)
    );

    const mmAdmin = new MatchmakingAdmin(l1Rpc, queueAuthority, DUEL_PROGRAM_ID);

    await mmAdmin.initializeTenant(RPS_GAME_PROGRAM_ID, {
      authority: queueAuthority.address,
      eloWindow: 100n,
      eloOffset: 8 + 32,
      eloDataType: "u64",
      callbackProgramId: RPS_GAME_PROGRAM_ID,
      callbackDiscriminator,
    });

    await mmAdmin.initializeQueue(queueAuthority.address, tenantPda);
    await mmAdmin.delegateQueue(queueAuthority.address, ER_VALIDATOR);

    console.log("Queue Active in TEE. Tenant PDA:", tenantPda);
  });

  it("Initialize Player Profiles & Delegate", async () => {
    const initP1Ix = await getInitializePlayerInstructionAsync({
      player: player1,
      payer: player1,
    });
    await sendInstruction(l1Rpc, initP1Ix, player1);

    const delegateP1Ix = await getDelegatePdaInstructionAsync({
      pda: p1ProfilePda,
      payer: player1,
      validator: ER_VALIDATOR,
      accountType: rpsAccountType("PlayerProfile", { player: player1.address }),
    });
    await sendInstruction(l1Rpc, delegateP1Ix, player1);

    const initP2Ix = await getInitializePlayerInstructionAsync({
      player: player2,
      payer: player2,
    });
    await sendInstruction(l1Rpc, initP2Ix, player2);

    const delegateP2Ix = await getDelegatePdaInstructionAsync({
      pda: p2ProfilePda,
      payer: player2,
      validator: ER_VALIDATOR,
      accountType: rpsAccountType("PlayerProfile", { player: player2.address }),
    });
    await sendInstruction(l1Rpc, delegateP2Ix, player2);

    console.log("Profiles Initialized & Delegated");
  });

  it("P1 enters queue (no match yet)", async () => {
    const clientP1 = new MatchmakingPlayer(l1Rpc, player1, DUEL_PROGRAM_ID);
    const teeRpc1 = createSolanaRpc(`${TEE_RPC_URL}?token=${token1}`);

    await clientP1.enterQueue(
      tenantPda, queuePda, p1ProfilePda,
      teeRpc1, `${TEE_RPC_URL}?token=${token1}`,
      ER_VALIDATOR, RPS_GAME_PROGRAM_ID,
    );
    console.log("P1 entered queue");
  });

  it("P2 joins queue -> match found -> callback fires via Tenant PDA", async () => {
    const clientP2 = new MatchmakingPlayer(l1Rpc, player2, DUEL_PROGRAM_ID);
    const teeRpc2 = createSolanaRpc(`${TEE_RPC_URL}?token=${token2}`);

    // Step-by-step so we can verify state after joinQueue
    await clientP2.createTicket(tenantPda);
    await clientP2.delegateTicket(player2.address, tenantPda, ER_VALIDATOR);

    const clientP2Tee = new MatchmakingPlayer(teeRpc2, player2, DUEL_PROGRAM_ID);
    const joinSig = await clientP2Tee.joinQueue(
      queuePda, tenantPda, p2ProfilePda, RPS_GAME_PROGRAM_ID,
    );
    console.log("P2 joinQueue sig:", joinSig);

    // TEE does not expose getTransaction logs reliably; verify callback effect via account state.
    // joinQueue: (1) finds match with P1, (2) CPIs on_match_found via Tenant PDA signer,
    // (3) sets both tickets to Matched. P2's ticket (no permission PDA) is readable by any auth.
    let matchFound = false;
    for (let i = 0; i < 10; i++) {
      const ticket = await fetchMaybeMatchTicket(teeRpc2, p2TicketPda);
      if (ticket.exists && ticket.data.status.__kind === "Matched") {
        matchFound = true;
        const { opponent, matchId } = ticket.data.status as {
          __kind: "Matched"; opponent: Address; matchId: bigint;
        };
        console.log(`P2 ticket Matched on TEE: opponent=${opponent}, matchId=${matchId}`);
        assert.equal(
          opponent as string,
          player1.address as string,
          "P2 opponent should be P1",
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(
      matchFound,
      "P2 ticket should be Matched on TEE — joinQueue found match and fired on_match_found via Tenant PDA",
    );

    console.log("Match confirmed on TEE: joinQueue matched P1+P2, fired on_match_found callback via Tenant PDA signer");
  });
});

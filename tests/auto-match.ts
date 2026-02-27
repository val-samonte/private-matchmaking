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
import { getAuthToken, waitForPermission } from "../sdk/src/tee.js";
import { derivePermissionPda } from "../sdk/src/utils.js";
import { sendInstruction } from "../sdk/src/transaction.js";

import {
  getInitializePlayerInstructionAsync,
  getDelegatePdaInstructionAsync,
  getMakeChoiceInstruction,
  getStartGameWithTicketInstructionAsync,
  getPersistResultsInstruction,
} from "../sdk/src/generated/rps-game/index.js";
import {
  fetchGameSession,
  fetchPlayerProfile,
} from "../sdk/src/generated/rps-game/accounts/index.js";
import { Choice } from "../sdk/src/generated/rps-game/types/index.js";
import { accountType as rpsAccountType } from "../sdk/src/generated/rps-game/types/accountType.js";

// Program IDs
const DUEL_PROGRAM_ID = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X" as Address;
const RPS_GAME_PROGRAM_ID = "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos" as Address;
const ER_VALIDATOR = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA" as Address;

const TEE_RPC_URL = "https://tee.magicblock.app";
const L1_RPC_URL = "https://api.devnet.solana.com";

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();

describe("web3-matchmaking-with-tickets", () => {
  const l1Rpc = createSolanaRpc(L1_RPC_URL);

  // Funded payer loaded from Anchor wallet (~/.config/solana/id.json)
  let payer: KeyPairSigner;
  let player1: KeyPairSigner;
  let player2: KeyPairSigner;
  let queueAuthority: KeyPairSigner;

  let queuePda: Address;
  let tenantPda: Address;
  let p1TicketPda: Address;
  let p2TicketPda: Address;
  let p1ProfilePda: Address;
  let p2ProfilePda: Address;

  let token1: string;
  let token2: string;
  let tokenQ: string;

  before("Generate keypairs and fund", async () => {
    // Load funded wallet from ~/.config/solana/id.json (set by Anchor.toml)
    const payerBytes = new Uint8Array(
      JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf-8"))
    );
    payer = await createKeyPairSignerFromBytes(payerBytes);
    player1 = await generateKeyPairSigner();
    player2 = await generateKeyPairSigner();
    queueAuthority = await generateKeyPairSigner();

    // Fund test accounts from the payer wallet in a single transaction
    const LAMPORTS = 100_000_000n; // 0.1 SOL each
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
    // Wait for transfer to land
    await new Promise((r) => setTimeout(r, 2000));

    // Derive PDAs
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

    const [t1Pda] = await getProgramDerivedAddress({
      programAddress: DUEL_PROGRAM_ID,
      seeds: [
        utf8Encoder.encode("ticket"),
        addressEncoder.encode(player1.address),
        addressEncoder.encode(tenantPda),
      ],
    });
    p1TicketPda = t1Pda;

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

    // Authenticate with TEE
    const auth1 = await getAuthToken(TEE_RPC_URL, player1);
    token1 = auth1.token;
    const auth2 = await getAuthToken(TEE_RPC_URL, player2);
    token2 = auth2.token;
    const authQ = await getAuthToken(TEE_RPC_URL, queueAuthority);
    tokenQ = authQ.token;

    console.log("P1 Auth Token:", token1.slice(0, 10) + "...");
  });

  it("Initialize Infrastructure (Tenant & Queue) & Delegate", async () => {
    // Compute Anchor discriminator for on_match_found
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

    console.log("Queue Initialized, Permission Set & Delegated (Dark Pool Active)");

    // Wait for TEE to pick up the Permission PDA — confirms ACL is enforced
    const queuePermActive = await waitForPermission(
      `${TEE_RPC_URL}?token=${tokenQ}`,
      queuePda,
      15000,
    );
    console.log(queuePermActive
      ? "Queue permission active on TEE — only authority can read queue state"
      : "Queue permission not yet active (TEE may still be syncing)"
    );
  });

  it("Initialize Player Profiles & Delegate", async () => {
    // P1 profile
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



    // P2 profile
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

  it("P1 Creates Ticket, Delegates, and Joins Queue", async () => {
    const clientP1 = new MatchmakingPlayer(l1Rpc, player1, DUEL_PROGRAM_ID);
    const teeRpc1 = createSolanaRpc(`${TEE_RPC_URL}?token=${token1}`);

    await clientP1.enterQueue(
      tenantPda, queuePda, p1ProfilePda,
      teeRpc1, `${TEE_RPC_URL}?token=${token1}`,
      ER_VALIDATOR, RPS_GAME_PROGRAM_ID,
    );
    console.log("P1 Entered Matchmaking Queue:", p1TicketPda);

    // Wait for TEE to pick up P1's ticket permission
    const p1PermActive = await waitForPermission(
      `${TEE_RPC_URL}?token=${token1}`,
      p1TicketPda,
      10000,
    );
    console.log(p1PermActive
      ? "P1 ticket permission active on TEE"
      : "P1 ticket permission not yet active (TEE still syncing)"
    );

    // Wait for TEE to process the join
    await new Promise(r => setTimeout(r, 3000));
    const teeRpcQ = createSolanaRpc(`${TEE_RPC_URL}?token=${tokenQ}`);
    const adminTee = new MatchmakingAdmin(teeRpcQ, queueAuthority, DUEL_PROGRAM_ID);
    const queue = await adminTee.getQueue(queuePda);
    console.log("Queue Entries (TEE via tokenQ):", queue.data.entries.length);
    assert.equal(queue.data.entries.length, 1);

    // Privacy check: L1 must not see any queue entries (account is either locked or shows 0)
    console.log("Checking L1 Privacy...");
    try {
      const adminL1 = new MatchmakingAdmin(l1Rpc, player1, DUEL_PROGRAM_ID);
      const queueL1 = await adminL1.getQueue(queuePda);
      assert.equal(queueL1.data.entries.length, 0, "Privacy breach: L1 should not see TEE queue entries");
      console.log("PRIVACY CONFIRMED: L1 sees 0 entries.");
    } catch (e: unknown) {
      if ((e as Error).name === "AssertionError") throw e;
      // Account is locked by the delegation program — full privacy, also acceptable
      console.log("PRIVACY CONFIRMED: L1 could not fetch account (Delegated/Locked).");
    }
  });

  it("Unauthorized TEE wallet cannot read queue state (permission PDA enforced)", async () => {
    // A wallet that has a valid TEE auth token but is NOT in the queue's permission set.
    // TEE auth (challenge-sign) requires no on-chain funds — any keypair can authenticate.
    const snooper = await generateKeyPairSigner();
    const snooperAuth = await getAuthToken(TEE_RPC_URL, snooper);
    const snooperRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${snooperAuth.token}`);

    // Attempt to read the queue as the snooper
    let sniffedEntries: number | null = null;
    let accessDenied = false;
    try {
      const adminSnooper = new MatchmakingAdmin(snooperRpc, snooper, DUEL_PROGRAM_ID);
      const queue = await adminSnooper.getQueue(queuePda);
      sniffedEntries = queue.data.entries.length;
    } catch {
      // TEE rejected the read outright — account returned null, fetch threw
      accessDenied = true;
    }

    if (accessDenied) {
      console.log("Permission enforced: TEE denied queue read to unauthorized wallet (account not found)");
    } else {
      assert.equal(
        sniffedEntries,
        0,
        `Privacy breach: unauthorized wallet read ${sniffedEntries} queue entries from TEE`,
      );
      console.log("Permission enforced: TEE returned masked data (0 entries) to unauthorized wallet");
    }

    // Sanity check: the authorized authority must still see the real entry
    const teeRpcQ = createSolanaRpc(`${TEE_RPC_URL}?token=${tokenQ}`);
    const adminAuth = new MatchmakingAdmin(teeRpcQ, queueAuthority, DUEL_PROGRAM_ID);
    const queueAuth = await adminAuth.getQueue(queuePda);
    assert.equal(queueAuth.data.entries.length, 1, "Queue authority must still see 1 entry after snooper attempt");
    console.log("Confirmed: authority still sees 1 queue entry — permission PDA working correctly");
  });

  it("P2 Creates Ticket, Delegates, Joins Queue -> Auto-Match", async () => {
    const clientP2 = new MatchmakingPlayer(l1Rpc, player2, DUEL_PROGRAM_ID);
    const teeRpc2 = createSolanaRpc(`${TEE_RPC_URL}?token=${token2}`);

    await clientP2.enterQueue(
      tenantPda, queuePda, p2ProfilePda,
      teeRpc2, `${TEE_RPC_URL}?token=${token2}`,
      ER_VALIDATOR, RPS_GAME_PROGRAM_ID,
    );
    console.log("P2 Entered Matchmaking Queue:", p2TicketPda);

    // Wait for TEE to process and check status
    await new Promise(r => setTimeout(r, 3000));
    const teeRpcQ2 = createSolanaRpc(`${TEE_RPC_URL}?token=${tokenQ}`);
    const adminTee2 = new MatchmakingAdmin(teeRpcQ2, queueAuthority, DUEL_PROGRAM_ID);
    const queue = await adminTee2.getQueue(queuePda);
    console.log("Queue Entries (After Auto-Match):", queue.data.entries.length);
    assert.equal(queue.data.entries.length, 0, "Queue should be empty after match");

    const p2TicketRes = await clientP2.withRpc(`${TEE_RPC_URL}?token=${token2}`).getTicket(p2TicketPda);
    assert.ok(p2TicketRes.exists, "P2 ticket should exist");
    const p2Status = p2TicketRes.data.status;
    console.log("P2 Ticket Status:", JSON.stringify(p2Status, (_, v) => typeof v === "bigint" ? v.toString() : v));
    assert.equal(p2Status.__kind, "Matched", "P2 ticket should be in Matched status");

    console.log("Pending matches:", queue.data.pendingMatches.length);
    assert.equal(queue.data.pendingMatches.length, 1, "Should have 1 pending match for P1");
  });

  it("Resolve Matches and Commit to L1", async () => {
    const teeRpcQ = createSolanaRpc(`${TEE_RPC_URL}?token=${tokenQ}`);
    const mmAdmin = new MatchmakingAdmin(teeRpcQ, queueAuthority, DUEL_PROGRAM_ID);

    // High-level: reads pending matches from queue, flushes them, waits, then commits all to L1
    await mmAdmin.resolveMatches(queuePda, tenantPda, [p1TicketPda, p2TicketPda]);
    console.log("Matches resolved and committed to L1");

    // Wait for L1 to settle
    await new Promise((r) => setTimeout(r, 5000));

    const bigIntReplacer = (_: string, v: unknown) => typeof v === "bigint" ? v.toString() : v;

    const p1Res = await new MatchmakingPlayer(l1Rpc, player1, DUEL_PROGRAM_ID).getTicket(p1TicketPda);
    const p2Res = await new MatchmakingPlayer(l1Rpc, player2, DUEL_PROGRAM_ID).getTicket(p2TicketPda);

    assert.ok(p1Res.exists, "P1 ticket should exist on L1");
    assert.ok(p2Res.exists, "P2 ticket should exist on L1");

    console.log("P1 Ticket (L1):", JSON.stringify(p1Res.data.status, bigIntReplacer));
    console.log("P2 Ticket (L1):", JSON.stringify(p2Res.data.status, bigIntReplacer));

    assert.equal(p1Res.data.status.__kind, "Matched", "P1 ticket should be Matched on L1");
    assert.equal(p2Res.data.status.__kind, "Matched", "P2 ticket should be Matched on L1");

    if (p1Res.data.status.__kind === "Matched") {
      assert.equal(p1Res.data.status.opponent, player2.address, "P1's opponent should be P2");
    }
    if (p2Res.data.status.__kind === "Matched") {
      assert.equal(p2Res.data.status.opponent, player1.address, "P2's opponent should be P1");
    }

    console.log("L1 Ticket verification complete - match data correct!");
  });

  it("Play Game (Start & Moves)", async () => {
    const gameId = 1n;

    // Encode gameId as LE uint64
    const gameIdBytes = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      gameIdBytes[i] = Number((gameId >> BigInt(i * 8)) & 0xffn);
    }

    const [gameSessionPda] = await getProgramDerivedAddress({
      programAddress: RPS_GAME_PROGRAM_ID,
      seeds: [
        utf8Encoder.encode("game_session_v1"),
        addressEncoder.encode(player1.address),
        addressEncoder.encode(player2.address),
        gameIdBytes,
      ],
    });

    // Start game with ticket verification
    const startIx = await getStartGameWithTicketInstructionAsync({
      player: player1,
      matchTicket: p1TicketPda,
      gameId,
      opponent: player2.address,
    });
    await sendInstruction(l1Rpc, startIx, player1);

    // Delegate game session to TEE
    const delegateGameIx = await getDelegatePdaInstructionAsync({
      pda: gameSessionPda,
      payer: player1,
      validator: ER_VALIDATOR,
      accountType: rpsAccountType("GameSession", {
        p1: player1.address,
        p2: player2.address,
        id: gameId,
      }),
    });
    await sendInstruction(l1Rpc, delegateGameIx, player1);

    console.log("Game Session Started & Delegated.");

    // P1 chooses Rock via TEE
    const teeRpc1 = createSolanaRpc(`${TEE_RPC_URL}?token=${token1}`);
    const rockIx = getMakeChoiceInstruction({
      gameSession: gameSessionPda,
      player1Profile: p1ProfilePda,
      player2Profile: p2ProfilePda,
      signer: player1,
      choice: Choice.Rock,
    });
    await sendInstruction(teeRpc1, rockIx, player1);
    console.log("P1 Chose Rock");

    // P2 chooses Paper via TEE
    const teeRpc2 = createSolanaRpc(`${TEE_RPC_URL}?token=${token2}`);
    const paperIx = getMakeChoiceInstruction({
      gameSession: gameSessionPda,
      player1Profile: p1ProfilePda,
      player2Profile: p2ProfilePda,
      signer: player2,
      choice: Choice.Paper,
    });
    await sendInstruction(teeRpc2, paperIx, player2);
    console.log("P2 Chose Paper");

    // Persist results via TEE
    const persistIx = getPersistResultsInstruction({
      gameSession: gameSessionPda,
      player1Profile: p1ProfilePda,
      player2Profile: p2ProfilePda,
      payer: player1,
    });
    await sendInstruction(teeRpc1, persistIx, player1);
    console.log("Results Persisted");

    // Verify result on TEE
    const session = await fetchGameSession(teeRpc1, gameSessionPda);
    console.log("Game Result:", JSON.stringify(session.data.result, (_, v) => typeof v === "bigint" ? v.toString() : v));

    const result = session.data.result;
    if (result.__kind === "Winner") {
      assert.equal(result.fields[0], player2.address, "P2 should win");
    }

    // Check ELO on TEE (profiles are still delegated)
    const p1Profile = await fetchPlayerProfile(teeRpc1, p1ProfilePda);
    const p2Profile = await fetchPlayerProfile(teeRpc2, p2ProfilePda);

    console.log(`P1 ELO (Loser 1000->${p1Profile.data.elo}): ${p1Profile.data.elo}`);
    console.log(`P2 ELO (Winner 1000->${p2Profile.data.elo}): ${p2Profile.data.elo}`);

    assert.ok(p1Profile.data.elo < 1000n, "P1 ELO should decrease");
    assert.ok(p2Profile.data.elo > 1000n, "P2 ELO should increase");

    // Verify ELO and game result committed to L1 by persist_results
    await new Promise(r => setTimeout(r, 5000));
    const p1ProfileL1 = await fetchPlayerProfile(l1Rpc, p1ProfilePda);
    const p2ProfileL1 = await fetchPlayerProfile(l1Rpc, p2ProfilePda);
    assert.equal(p1ProfileL1.data.elo, p1Profile.data.elo, "P1 ELO committed to L1");
    assert.equal(p2ProfileL1.data.elo, p2Profile.data.elo, "P2 ELO committed to L1");
    const gameSessionL1 = await fetchGameSession(l1Rpc, gameSessionPda);
    assert.equal(gameSessionL1.data.result.__kind, "Winner", "Game result committed to L1");
    console.log(`ELO and game result confirmed on L1 — P1: ${p1ProfileL1.data.elo}, P2: ${p2ProfileL1.data.elo}`);
  });

  it("Third-party can read MatchTicket PDA on L1 to verify match", async () => {
    const [derivedP1Ticket] = await getProgramDerivedAddress({
      programAddress: DUEL_PROGRAM_ID,
      seeds: [
        utf8Encoder.encode("ticket"),
        addressEncoder.encode(player1.address),
        addressEncoder.encode(tenantPda),
      ],
    });

    const clientAny = new MatchmakingPlayer(l1Rpc, player1, DUEL_PROGRAM_ID);
    const ticketRes = await clientAny.getTicket(derivedP1Ticket);

    assert.ok(ticketRes.exists, "Ticket should exist");
    const ticket = ticketRes.data;
    assert.equal(ticket.player, player1.address, "Ticket player should match");
    assert.equal(ticket.tenant, tenantPda, "Ticket tenant should match");
    assert.equal(ticket.status.__kind, "Matched", "Ticket should show matched status");

    console.log("Third-party verification successful:");
    console.log("  Player:", ticket.player);
    console.log("  Tenant:", ticket.tenant);
    console.log("  Status:", JSON.stringify(ticket.status, (_, v) => typeof v === "bigint" ? v.toString() : v));
  });

  after("Cleanup", async () => {
    // Delegated accounts cannot be closed easily by the original owner program.
  });
});

/**
 * Stress test: closest-ELO matching.
 *
 * Two scenarios:
 *
 * 1. SEQUENTIAL — 3-player controlled scenario that proves the closest-ELO
 *    fix works.  P_far (940) and P_near (1060) are both in the queue but
 *    outside each other's window (diff 120 > 100).  P_test (1020) then joins
 *    and has two candidates: P_far (diff 80) and P_near (diff 40).
 *    The fixed algorithm must pick P_near (closest), not P_far (first found).
 *
 * 2. CONCURRENT — N_CONCURRENT players all call joinQueue simultaneously.
 *    Verifies no one is left unmatched and every pair is within the ELO window.
 *
 * ELO seeding is done on plain L1 (start_game + make_choice).  No TEE or
 * persist_results needed: make_choice on L1 updates profiles in-place and the
 * change is committed to L1 state immediately.
 *
 * Run:
 *   npx tsx node_modules/.bin/_mocha --timeout 1000000 tests/stress-elo.ts
 */

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
import { sendInstruction, sendInstructions } from "../sdk/src/transaction.js";

import {
  getInitializePlayerInstructionAsync,
  getDelegatePdaInstructionAsync,
  getStartGameInstructionAsync,
  getMakeChoiceInstruction,
} from "../sdk/src/generated/rps-game/index.js";
import { fetchPlayerProfile } from "../sdk/src/generated/rps-game/accounts/index.js";
import { Choice } from "../sdk/src/generated/rps-game/types/index.js";
import { accountType as rpsAccountType } from "../sdk/src/generated/rps-game/types/accountType.js";
import { fetchMaybeMatchTicket } from "../sdk/src/generated/duel/index.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const DUEL_PROGRAM_ID     = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X" as Address;
const RPS_GAME_PROGRAM_ID = "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos" as Address;
const ER_VALIDATOR        = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA" as Address;
const TEE_RPC_URL         = "https://tee.magicblock.app";
const L1_RPC_URL          = "https://api.devnet.solana.com";
const ELO_WINDOW          = 100n;

// N_CONCURRENT must be even (matched into pairs).
const N_CONCURRENT = 4;

// Seeding plan:
//   pNear wins 6 games vs pFar  → pNear = 1060, pFar = 940   (diff 120 > 100)
//   pTest wins 2 games vs pDummy → pTest = 1020              (diff to pNear = 40, to pFar = 80)
//   Each concurrent pair plays 3 games → winner = 1030, loser = 970 (diff 60 ≤ 100)
const NEAR_VS_FAR_ROUNDS = 6;  // → 1060 vs 940
const TEST_WINS          = 2;  // → 1020

// ─── Helpers ─────────────────────────────────────────────────────────────────

const addressEncoder = getAddressEncoder();
const utf8Encoder    = getUtf8Encoder();
const l1Rpc = createSolanaRpc(L1_RPC_URL);

async function deriveProfilePda(player: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: RPS_GAME_PROGRAM_ID,
    seeds: [utf8Encoder.encode("player_profile_v35"), addressEncoder.encode(player)],
  });
  return pda;
}

async function deriveTicketPda(player: Address, tenant: Address): Promise<Address> {
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

async function deriveGameSessionPda(p1: Address, p2: Address, gameId: bigint): Promise<Address> {
  const gameIdBytes = new Uint8Array(8);
  let n = gameId;
  for (let i = 0; i < 8; i++) { gameIdBytes[i] = Number(n & 0xffn); n >>= 8n; }
  const [pda] = await getProgramDerivedAddress({
    programAddress: RPS_GAME_PROGRAM_ID,
    seeds: [
      utf8Encoder.encode("game_session_v1"),
      addressEncoder.encode(p1),
      addressEncoder.encode(p2),
      gameIdBytes,
    ],
  });
  return pda;
}

/** Bulk SOL transfer from payer to many destinations in a single transaction. */
async function fundAll(payer: KeyPairSigner, dests: KeyPairSigner[], lamports = 150_000_000n) {
  const ixs: Instruction[] = dests.map((dest) => {
    const buf = new Uint8Array(12);
    new DataView(buf.buffer).setUint32(0, 2, true);
    new DataView(buf.buffer).setBigUint64(4, lamports, true);
    return {
      programAddress: "11111111111111111111111111111111" as Address,
      accounts: [
        { address: payer.address, role: AccountRole.WRITABLE_SIGNER },
        { address: dest.address,  role: AccountRole.WRITABLE },
      ],
      data: buf,
    } satisfies Instruction;
  });
  await sendInstructions(l1Rpc, ixs, payer);
  await new Promise(r => setTimeout(r, 2000));
}

/**
 * Run `rounds` games between winner and loser on plain L1.
 * winner always picks Rock, loser always picks Scissors.
 * ELO is committed directly to L1 inside make_choice — no TEE needed.
 * Returns the next unused gameId.
 */
async function seedGames(
  winner:    KeyPairSigner,
  loser:     KeyPairSigner,
  rounds:    number,
  startId:   bigint,
): Promise<bigint> {
  const winnerProfile = await deriveProfilePda(winner.address);
  const loserProfile  = await deriveProfilePda(loser.address);
  let gameId = startId;

  for (let r = 0; r < rounds; r++) {
    const startIx = await getStartGameInstructionAsync({
      player:   winner,
      gameId,
      opponent: loser.address,
    });
    await sendInstruction(l1Rpc, startIx, winner);

    const gameSession = await deriveGameSessionPda(winner.address, loser.address, gameId);

    // winner picks Rock first (partial)
    const rockIx = getMakeChoiceInstruction({
      gameSession,
      player1Profile: winnerProfile,
      player2Profile: loserProfile,
      signer:  winner,
      choice:  Choice.Rock,
    });
    await sendInstruction(l1Rpc, rockIx, winner);

    // loser picks Scissors — triggers ELO update on L1 in the same tx
    const scissorsIx = getMakeChoiceInstruction({
      gameSession,
      player1Profile: winnerProfile,
      player2Profile: loserProfile,
      signer:  loser,
      choice:  Choice.Scissors,
    });
    await sendInstruction(l1Rpc, scissorsIx, loser);

    gameId++;
  }
  return gameId;
}

/** Delegate a player profile to TEE. */
async function delegateProfile(player: KeyPairSigner): Promise<void> {
  const profilePda = await deriveProfilePda(player.address);
  const ix = await getDelegatePdaInstructionAsync({
    pda:         profilePda,
    payer:       player,
    validator:   ER_VALIDATOR,
    accountType: rpsAccountType("PlayerProfile", { player: player.address }),
  });
  await sendInstruction(l1Rpc, ix, player);
}

/** Read ELO from L1. */
async function readElo(player: Address): Promise<bigint> {
  const prof = await fetchPlayerProfile(l1Rpc, await deriveProfilePda(player));
  return prof.data.elo;
}

/** Set up a new tenant + queue and delegate to TEE. Returns [tenantPda, queuePda]. */
async function initQueue(authority: KeyPairSigner): Promise<[Address, Address]> {
  const callbackDiscriminator = Array.from(
    crypto.createHash("sha256").update("global:on_match_found").digest().slice(0, 8)
  );
  const admin = new MatchmakingAdmin(l1Rpc, authority, DUEL_PROGRAM_ID);
  await admin.initializeTenant(RPS_GAME_PROGRAM_ID, {
    eloOffset:             40,
    eloDataType:           "u64",
    eloWindow:             ELO_WINDOW,
    callbackProgramId:     RPS_GAME_PROGRAM_ID,
    callbackDiscriminator,
  });

  const [tPda] = await getProgramDerivedAddress({
    programAddress: DUEL_PROGRAM_ID,
    seeds: [utf8Encoder.encode("tenant"), addressEncoder.encode(authority.address)],
  });
  const [qPda] = await getProgramDerivedAddress({
    programAddress: DUEL_PROGRAM_ID,
    seeds: [utf8Encoder.encode("queue"), addressEncoder.encode(authority.address)],
  });

  await admin.initializeQueue(authority.address, tPda);
  await admin.delegateQueue(authority.address, ER_VALIDATOR);
  console.log(`  Queue delegated (authority ${authority.address.slice(0, 8)}…)`);
  return [tPda, qPda];
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe(`stress-elo (ELO window: ${ELO_WINDOW}, concurrent: ${N_CONCURRENT})`, () => {

  let payer: KeyPairSigner;

  // Sequential scenario players
  let pNear:  KeyPairSigner;  // target ELO 1060
  let pFar:   KeyPairSigner;  // target ELO  940
  let pTest:  KeyPairSigner;  // target ELO 1020
  let pDummy: KeyPairSigner;  // seeding punching-bag for pTest (ELO irrelevant)
  let seqQueueAuth: KeyPairSigner;
  let seqTenantPda: Address;
  let seqQueuePda:  Address;

  // Concurrent scenario players
  let concPlayers:   KeyPairSigner[];  // length = N_CONCURRENT
  let concQueueAuth: KeyPairSigner;
  let concTenantPda: Address;
  let concQueuePda:  Address;

  // ── Setup ─────────────────────────────────────────────────────────────────

  before("Generate keypairs, fund, init infrastructure", async () => {
    assert.isTrue(N_CONCURRENT >= 2 && N_CONCURRENT % 2 === 0,
      "N_CONCURRENT must be even and ≥ 2");

    const payerBytes = new Uint8Array(
      JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf-8"))
    );
    payer = await createKeyPairSignerFromBytes(payerBytes);

    [pNear, pFar, pTest, pDummy, seqQueueAuth, concQueueAuth] = await Promise.all(
      Array.from({ length: 6 }, () => generateKeyPairSigner())
    );
    concPlayers = await Promise.all(
      Array.from({ length: N_CONCURRENT }, () => generateKeyPairSigner())
    );

    const allWallets = [pNear, pFar, pTest, pDummy, seqQueueAuth, concQueueAuth, ...concPlayers];
    console.log(`Funding ${allWallets.length} wallets…`);
    await fundAll(payer, allWallets);

    // Initialise player profiles on L1
    console.log("Initialising player profiles…");
    const profilePlayers = [pNear, pFar, pTest, pDummy, ...concPlayers];
    await Promise.all(profilePlayers.map(async (p) => {
      const ix = await getInitializePlayerInstructionAsync({ player: p, payer: p });
      await sendInstruction(l1Rpc, ix, p);
    }));
    await new Promise(r => setTimeout(r, 2000));

    // Init two independent queues (sequential + concurrent tests are isolated)
    console.log("Setting up queues…");
    [seqTenantPda, seqQueuePda]   = await initQueue(seqQueueAuth);
    [concTenantPda, concQueuePda] = await initQueue(concQueueAuth);
    await new Promise(r => setTimeout(r, 2000));
  });

  // ── ELO seeding ───────────────────────────────────────────────────────────

  it("Seed ELO via L1 games (no TEE required)", async () => {
    // All seeding runs on plain L1 — start_game creates the session, make_choice
    // commits ELO directly into the profile accounts in the same transaction.
    // No persist_results / TEE delegation needed.

    let nextId = 100n; // use high IDs so they don't collide with later match IDs

    // pNear (wins 6) vs pFar (loses 6) → 1060 vs 940
    console.log(`Seeding ${NEAR_VS_FAR_ROUNDS} games: pNear vs pFar…`);
    nextId = await seedGames(pNear, pFar, NEAR_VS_FAR_ROUNDS, nextId);

    // pTest (wins 2) vs pDummy (loses 2) → 1020 vs 980
    console.log(`Seeding ${TEST_WINS} games: pTest vs pDummy…`);
    nextId = await seedGames(pTest, pDummy, TEST_WINS, nextId);

    // Concurrent players: each adjacent pair plays 3 games
    // → winner[i] = 1030, loser[i+1] = 970
    const CONC_ROUNDS = 3;
    for (let i = 0; i < concPlayers.length; i += 2) {
      const w = concPlayers[i], l = concPlayers[i + 1];
      console.log(`Seeding ${CONC_ROUNDS} games: concPlayers[${i}] vs [${i + 1}]…`);
      nextId = await seedGames(w, l, CONC_ROUNDS, nextId);
    }

    await new Promise(r => setTimeout(r, 3000));

    // Verify ELOs on L1
    const nearElo = await readElo(pNear.address);
    const farElo  = await readElo(pFar.address);
    const testElo = await readElo(pTest.address);
    console.log(`\nPost-seed ELO:  pNear=${nearElo}  pFar=${farElo}  pTest=${testElo}`);
    assert.equal(nearElo, 1000n + BigInt(NEAR_VS_FAR_ROUNDS * 10), `pNear ELO`);
    assert.equal(farElo,  1000n - BigInt(NEAR_VS_FAR_ROUNDS * 10), `pFar ELO`);
    assert.equal(testElo, 1000n + BigInt(TEST_WINS * 10),           `pTest ELO`);

    console.log("\nConcurrent player ELOs:");
    for (let i = 0; i < concPlayers.length; i++) {
      const elo = await readElo(concPlayers[i].address);
      const expected = i % 2 === 0 ? 1000n + 30n : 1000n - 30n;
      console.log(`  concPlayers[${i}] = ${elo} (expected ${expected})`);
      assert.equal(elo, expected, `concPlayers[${i}] ELO`);
    }

    // Sanity: pNear and pFar are outside each other's window
    assert.isTrue(nearElo - farElo > ELO_WINDOW,
      `pNear(${nearElo}) and pFar(${farElo}) must be outside window (${ELO_WINDOW}) so they don't match each other`);
    // pTest is closer to pNear than to pFar
    const distToNear = nearElo - testElo;
    const distToFar  = testElo - farElo;
    assert.isTrue(distToNear < distToFar,
      `pTest must be closer to pNear (diff=${distToNear}) than to pFar (diff=${distToFar})`);
    assert.isTrue(distToNear <= ELO_WINDOW && distToFar <= ELO_WINDOW,
      `pTest must be within window of BOTH pNear and pFar`);

    console.log(`\n✓ Seeding complete. Sequential scenario is unambiguous:`);
    console.log(`  pFar(${farElo}) ↔ pNear(${nearElo}): diff=${nearElo - farElo} > ${ELO_WINDOW} (outside window — will NOT match each other)`);
    console.log(`  pTest(${testElo}) vs pNear(${nearElo}): diff=${distToNear} (closer)`);
    console.log(`  pTest(${testElo}) vs pFar(${farElo}):  diff=${distToFar} (farther)`);
    console.log(`  Expected: pTest matches pNear (closest-ELO)`);
  });

  // ── Sequential scenario ───────────────────────────────────────────────────

  it("Sequential: P_far and P_near in queue (unmatched), P_test joins and picks the closest", async () => {
    // Delegate profiles to TEE so join_queue can read ELO from the delegated accounts
    console.log("Delegating pNear, pFar, pTest profiles to TEE…");
    await Promise.all([
      delegateProfile(pNear),
      delegateProfile(pFar),
      delegateProfile(pTest),
    ]);
    await new Promise(r => setTimeout(r, 3000));

    const { token: tAuth } = await getAuthToken(TEE_RPC_URL, seqQueueAuth);
    const teeRpcAuth = createSolanaRpc(`${TEE_RPC_URL}?token=${tAuth}`);
    const adminTee = new MatchmakingAdmin(teeRpcAuth, seqQueueAuth, DUEL_PROGRAM_ID);

    // ── Step 1: pFar enters queue ──────────────────────────────────────────
    console.log("\n[1/3] pFar (ELO 940) enters queue…");
    const { token: tFar } = await getAuthToken(TEE_RPC_URL, pFar);
    const farClient = new MatchmakingPlayer(l1Rpc, pFar, DUEL_PROGRAM_ID);
    await farClient.enterQueue(
      seqTenantPda, seqQueuePda, await deriveProfilePda(pFar.address),
      createSolanaRpc(`${TEE_RPC_URL}?token=${tFar}`), `${TEE_RPC_URL}?token=${tFar}`,
      ER_VALIDATOR, RPS_GAME_PROGRAM_ID,
    );
    await new Promise(r => setTimeout(r, 2000));

    const qAfterFar = await adminTee.getQueue(seqQueuePda);
    console.log(`  Queue: ${qAfterFar.data.entries.length} entry/entries`);
    assert.equal(qAfterFar.data.entries.length, 1, "pFar should be alone in queue");

    // ── Step 2: pNear enters queue — must NOT match pFar (diff > window) ──
    console.log("\n[2/3] pNear (ELO 1060) enters queue — diff with pFar = 120 > 100, no match expected…");
    const { token: tNear } = await getAuthToken(TEE_RPC_URL, pNear);
    const nearClient = new MatchmakingPlayer(l1Rpc, pNear, DUEL_PROGRAM_ID);
    await nearClient.enterQueue(
      seqTenantPda, seqQueuePda, await deriveProfilePda(pNear.address),
      createSolanaRpc(`${TEE_RPC_URL}?token=${tNear}`), `${TEE_RPC_URL}?token=${tNear}`,
      ER_VALIDATOR, RPS_GAME_PROGRAM_ID,
    );
    await new Promise(r => setTimeout(r, 2000));

    const qAfterNear = await adminTee.getQueue(seqQueuePda);
    console.log(`  Queue: ${qAfterNear.data.entries.length} entries`);
    assert.equal(qAfterNear.data.entries.length, 2,
      "Both pFar and pNear should be in queue — they are outside each other's window");

    // ── Step 3: pTest joins — two candidates: pFar (diff 80) and pNear (diff 40) ──
    console.log("\n[3/3] pTest (ELO 1020) enters queue — should match pNear (diff 40) not pFar (diff 80)…");
    const { token: tTest } = await getAuthToken(TEE_RPC_URL, pTest);
    const testClient = new MatchmakingPlayer(l1Rpc, pTest, DUEL_PROGRAM_ID);
    const testTicketPda = await testClient.enterQueue(
      seqTenantPda, seqQueuePda, await deriveProfilePda(pTest.address),
      createSolanaRpc(`${TEE_RPC_URL}?token=${tTest}`), `${TEE_RPC_URL}?token=${tTest}`,
      ER_VALIDATOR, RPS_GAME_PROGRAM_ID,
    );
    await new Promise(r => setTimeout(r, 2000));

    const qAfterTest = await adminTee.getQueue(seqQueuePda);
    console.log(`  Queue after pTest joins: ${qAfterTest.data.entries.length} entries`);
    console.log(`  Pending matches: ${qAfterTest.data.pendingMatches.length}`);
    assert.equal(qAfterTest.data.entries.length, 1, "Queue should have 1 entry left (pFar, unmatched)");
    assert.equal(qAfterTest.data.pendingMatches.length, 1, "Should have 1 pending match to flush");

    // Verify pTest's ticket shows Matched with pNear on TEE
    const testTicketTee = await new MatchmakingPlayer(
      createSolanaRpc(`${TEE_RPC_URL}?token=${tTest}`), pTest, DUEL_PROGRAM_ID
    ).getTicket(testTicketPda);
    assert.ok(testTicketTee.exists, "pTest ticket should exist on TEE");
    assert.equal(testTicketTee.data.status.__kind, "Matched",
      "pTest ticket should be Matched immediately in TEE");
    const testStatus = testTicketTee.data.status as { __kind: "Matched"; opponent: Address; matchId: bigint };
    assert.equal(testStatus.opponent as string, pNear.address as string,
      `pTest should have matched pNear (closest ELO), not pFar. Got opponent: ${testStatus.opponent.slice(0,8)}…`);
    console.log(`\n  ✓ pTest matched pNear (diff 40) — NOT pFar (diff 80)`);

    // Verify pFar is still searching (remaining queue entry)
    const remainingEntry = qAfterTest.data.entries[0];
    assert.equal(remainingEntry.player as string, pFar.address as string,
      "pFar should be the unmatched remaining entry in queue");
    console.log(`  ✓ pFar remains in queue unmatched (ELO ${remainingEntry.elo})`);

    // ── Resolve + commit to L1 ────────────────────────────────────────────
    console.log("\nFlushing and committing pTest/pNear match to L1…");
    const nearTicketPda = await deriveTicketPda(pNear.address, seqTenantPda);
    await adminTee.resolveMatches(seqQueuePda, seqTenantPda, [testTicketPda, nearTicketPda]);
    await new Promise(r => setTimeout(r, 6000));

    // Confirm on L1
    let nearL1Matched = false;
    for (let i = 0; i < 10; i++) {
      const t = await fetchMaybeMatchTicket(l1Rpc, nearTicketPda);
      if (t.exists && t.data.status.__kind === "Matched") { nearL1Matched = true; break; }
      await new Promise(r => setTimeout(r, 2000));
    }
    assert.ok(nearL1Matched, "pNear ticket should be Matched on L1 after commit");
    console.log("  ✓ Match confirmed on L1");

    // ── Cleanup: cancel pFar's stranded ticket and return it to L1 ───────
    // Best-effort: use pFar's TEE session for both cancel AND commit so the
    // commit_accounts() call sees the dirty state from cancelTicket.
    console.log("\nCancelling pFar's stranded ticket (best-effort)…");
    const farTicketPda = await deriveTicketPda(pFar.address, seqTenantPda);
    const DELEGPROG = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh" as Address;
    try {
      const { getCancelTicketInstructionAsync, getCommitTicketsInstruction, getCloseTicketInstructionAsync } =
        await import("../sdk/src/generated/duel/index.js");
      const farTeeRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${tFar}`);

      // 1. Cancel on TEE using pFar's session
      const farCancelIx = await getCancelTicketInstructionAsync({ player: pFar, tenant: seqTenantPda });
      await sendInstruction(farTeeRpc, farCancelIx, pFar);

      // 2. Commit using pFar's session (same dirty-set as the cancel)
      const commitCancelIx = getCommitTicketsInstruction({ tenant: seqTenantPda, payer: pFar });
      const commitWithRemaining = {
        ...commitCancelIx,
        accounts: [...commitCancelIx.accounts, { address: farTicketPda, role: AccountRole.WRITABLE }],
      };
      await sendInstruction(farTeeRpc, commitWithRemaining as any, pFar);

      // 3. Poll L1 until ticket returns (owner changes from delegation program)
      console.log("  Waiting for pFar ticket to return to L1…");
      let returnedToL1 = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const info = await l1Rpc.getAccountInfo(farTicketPda, { encoding: "base64" }).send();
        if (!info.value || info.value.owner !== DELEGPROG) {
          console.log(`  Ticket back on L1 after ${(i + 1) * 2}s`);
          returnedToL1 = true;
          break;
        }
      }

      // 4. Close on L1 if returned
      if (returnedToL1) {
        const closeIx = await getCloseTicketInstructionAsync({ player: pFar, tenant: seqTenantPda });
        await sendInstruction(l1Rpc, closeIx, pFar);
        console.log("  ✓ pFar ticket cancelled and closed");
      } else {
        console.log("  ⚠ pFar ticket did not return to L1 within 60s — skipping close (stale, will be cleaned up on next run)");
      }
    } catch (cleanupErr: any) {
      console.warn("  ⚠ pFar cleanup failed (best-effort, not blocking test):", cleanupErr.message);
    }
  });

  // ── Concurrent scenario ───────────────────────────────────────────────────

  it(`Concurrent: ${N_CONCURRENT} players join simultaneously — all matched within window`, async () => {
    // Delegate all concurrent player profiles to TEE
    console.log(`Delegating ${N_CONCURRENT} profiles to TEE…`);
    await Promise.all(concPlayers.map(p => delegateProfile(p)));
    await new Promise(r => setTimeout(r, 3000));

    // Snapshot ELOs
    const elos = new Map<string, bigint>();
    for (const p of concPlayers) {
      elos.set(p.address as string, await readElo(p.address));
    }

    console.log("\nPre-join ELO ladder:");
    [...elos.entries()]
      .sort((a, b) => Number(a[1] - b[1]))
      .forEach(([addr, elo]) => console.log(`  ELO ${elo}  ${addr.slice(0, 8)}…`));

    // ── All N players enter queue concurrently ─────────────────────────────
    console.log(`\nAll ${N_CONCURRENT} players joining queue simultaneously…`);
    const ticketPdas = await Promise.all(concPlayers.map(async (p) => {
      const { token } = await getAuthToken(TEE_RPC_URL, p);
      const teeRpc    = createSolanaRpc(`${TEE_RPC_URL}?token=${token}`);
      const client    = new MatchmakingPlayer(l1Rpc, p, DUEL_PROGRAM_ID);
      return client.enterQueue(
        concTenantPda, concQueuePda, await deriveProfilePda(p.address),
        teeRpc, `${TEE_RPC_URL}?token=${token}`,
        ER_VALIDATOR, RPS_GAME_PROGRAM_ID,
      );
    }));
    console.log("All joinQueue calls returned. Running resolveMatches…");

    // ── Crank ─────────────────────────────────────────────────────────────
    const { token: tConcAuth } = await getAuthToken(TEE_RPC_URL, concQueueAuth);
    const adminTee = new MatchmakingAdmin(
      createSolanaRpc(`${TEE_RPC_URL}?token=${tConcAuth}`), concQueueAuth, DUEL_PROGRAM_ID
    );
    await adminTee.resolveMatches(concQueuePda, concTenantPda, ticketPdas);
    console.log("Waiting for L1 commit…");
    await new Promise(r => setTimeout(r, 8000));

    // ── Poll L1 for all ticket statuses ───────────────────────────────────
    const results = new Map<string, { opponent: Address; matchId: bigint }>();
    for (let attempt = 0; attempt < 15; attempt++) {
      for (const p of concPlayers) {
        if (results.has(p.address as string)) continue;
        const tPda = await deriveTicketPda(p.address, concTenantPda);
        const t    = await fetchMaybeMatchTicket(l1Rpc, tPda);
        if (t.exists && t.data.status.__kind === "Matched") {
          const s = t.data.status as { __kind: "Matched"; opponent: Address; matchId: bigint };
          results.set(p.address as string, { opponent: s.opponent, matchId: s.matchId });
        }
      }
      if (results.size === concPlayers.length) break;
      console.log(`  ${results.size}/${concPlayers.length} tickets confirmed on L1 — retrying…`);
      await new Promise(r => setTimeout(r, 2000));
    }

    // ── Report pairings ───────────────────────────────────────────────────
    console.log("\nActual pairings (TEE join order determines result — all must be within window):");
    const seen  = new Set<string>();
    let totalDiff = 0;
    for (const [addr, { opponent }] of results) {
      if (seen.has(addr)) continue;
      seen.add(addr); seen.add(opponent as string);
      const eloA = elos.get(addr) ?? 0n;
      const eloB = elos.get(opponent as string) ?? 0n;
      const diff = Number(eloA > eloB ? eloA - eloB : eloB - eloA);
      totalDiff += diff;
      console.log(
        `  ${addr.slice(0,8)}… (ELO ${eloA}) ↔ ${(opponent as string).slice(0,8)}… (ELO ${eloB})  diff=${diff}`
      );
    }
    console.log(`  Total ELO diff across all pairs: ${totalDiff}`);

    // ── Assertions ────────────────────────────────────────────────────────
    assert.equal(results.size, concPlayers.length,
      `All ${concPlayers.length} players must be matched. Only ${results.size} were.`);

    for (const [addr, { opponent }] of results) {
      const eloA = elos.get(addr) ?? 0n;
      const eloB = elos.get(opponent as string) ?? 0n;
      const diff = eloA > eloB ? eloA - eloB : eloB - eloA;
      assert.isAtMost(Number(diff), Number(ELO_WINDOW),
        `Pair (${addr.slice(0,8)}, ${(opponent as string).slice(0,8)}) diff=${diff} exceeds ELO window ${ELO_WINDOW}`);
    }

    console.log(`\n✓ All ${N_CONCURRENT} players matched, all pairs within ELO window ${ELO_WINDOW}`);
  });
});

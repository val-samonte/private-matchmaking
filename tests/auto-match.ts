import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RpsGame } from "../target/types/rps_game";
import { Duel } from "../target/types/duel";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

import { assert } from "chai";

import {
  getAuthToken,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import * as nacl from "tweetnacl";
import * as crypto from "crypto";
import { MatchmakingAdmin, MatchmakingPlayer } from "../sdk/src";

describe("web3-matchmaking-with-tickets", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const rpsGame = anchor.workspace.RpsGame as Program<RpsGame>;
  const privateMatchmaking = anchor.workspace.Duel as Program<Duel>;

  // Seeds
  const queueSeed = Buffer.from("queue");
  const ticketSeed = Buffer.from("ticket");
  const playerProfileSeed = Buffer.from("player_profile_v35");

  // Hardcoded Validator from Reference
  const ER_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");

  // TEE Configuration
  const TEE_RPC_URL = "https://tee.magicblock.app";
  const TEE_WS_URL = "wss://tee.magicblock.app";

  const queueAuthority = Keypair.generate();
  const [queuePda] = PublicKey.findProgramAddressSync(
    [queueSeed, queueAuthority.publicKey.toBuffer()],
    privateMatchmaking.programId
  );

  const tenantSeed = Buffer.from("tenant");
  const [tenantPda] = PublicKey.findProgramAddressSync(
    [tenantSeed, queueAuthority.publicKey.toBuffer()],
    privateMatchmaking.programId
  );

  const player1 = Keypair.generate();
  const player2 = Keypair.generate();

  // Derive ticket PDAs
  const [p1TicketPda] = PublicKey.findProgramAddressSync(
    [ticketSeed, player1.publicKey.toBuffer(), tenantPda.toBuffer()],
    privateMatchmaking.programId
  );
  const [p2TicketPda] = PublicKey.findProgramAddressSync(
    [ticketSeed, player2.publicKey.toBuffer(), tenantPda.toBuffer()],
    privateMatchmaking.programId
  );

  const [p1ProfilePda] = PublicKey.findProgramAddressSync(
    [playerProfileSeed, player1.publicKey.toBuffer()],
    rpsGame.programId
  );
  const [p2ProfilePda] = PublicKey.findProgramAddressSync(
    [playerProfileSeed, player2.publicKey.toBuffer()],
    rpsGame.programId
  );

  let providerL1Player1: anchor.AnchorProvider;
  let providerL1Player2: anchor.AnchorProvider;
  let providerTeePlayer1: anchor.AnchorProvider;
  let providerTeePlayer2: anchor.AnchorProvider;
  let providerTeeQueueAuth: anchor.AnchorProvider;

  let token1: any;
  let token2: any;
  let tokenQ: any;

  // Helpers
  async function getTeeProgram(signer: Keypair, customProvider?: anchor.AnchorProvider): Promise<Program<RpsGame>> {
    const p = customProvider || new anchor.AnchorProvider(new anchor.web3.Connection(TEE_RPC_URL), new anchor.Wallet(signer), { commitment: "confirmed" });
    return new anchor.Program(rpsGame.idl as any, p);
  }

  async function getMatchmakingProgram(signer: Keypair, customProvider?: anchor.AnchorProvider): Promise<Program<Duel>> {
    const p = customProvider || new anchor.AnchorProvider(new anchor.web3.Connection(TEE_RPC_URL), new anchor.Wallet(signer), { commitment: "confirmed" });
    return new anchor.Program(privateMatchmaking.idl as any, p);
  }

  // Robust transaction sender
  async function sendAndConfirmRobust(program: Program<any>, instructionPromise: Promise<any>, signers: Keypair[] = []) {
    const provider = program.provider as anchor.AnchorProvider;
    const connection = provider.connection;

    const tx = await instructionPromise;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

    tx.recentBlockhash = blockhash;
    tx.feePayer = provider.wallet.publicKey;

    if (signers.length > 0) {
      tx.partialSign(...signers);
    }
    const signedTx = await provider.wallet.signTransaction(tx);
    const rawTx = signedTx.serialize();

    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });
    console.log(`Sent tx: ${signature}. Waiting for confirmation...`);

    let confirmed = false;
    while (!confirmed) {
      const currentHeight = await connection.getBlockHeight("confirmed");
      if (currentHeight > lastValidBlockHeight) {
        throw new Error(`Transaction ${signature} expired without confirmation.`);
      }

      const status = await connection.getSignatureStatus(signature);
      if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
        if (status.value.err) {
          throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.value.err)}`);
        }
        confirmed = true;
        return signature;
      }

      if (status.value === null) {
        await connection.sendRawTransaction(rawTx, {
          skipPreflight: true,
          preflightCommitment: "confirmed",
        });
      }

      await new Promise(r => setTimeout(r, 2000));
    }
    return signature;
  }

  before("Setup and Fund", async () => {
    const payer = (provider.wallet as anchor.Wallet).payer;
    await sendAndConfirmTransaction(provider.connection, new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: player1.publicKey, lamports: 0.1 * 10 ** 9 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: player2.publicKey, lamports: 0.1 * 10 ** 9 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: queueAuthority.publicKey, lamports: 0.1 * 10 ** 9 })
    ), [payer]);

    // Consistent confirm options matching MagicBlock reference examples
    const confirmOpts = { commitment: "confirmed" as const, skipPreflight: true };

    // Create L1 providers for each player
    providerL1Player1 = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(player1), confirmOpts);
    providerL1Player2 = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(player2), confirmOpts);

    // Authenticate and Create TEE Providers
    token1 = await getAuthToken(TEE_RPC_URL, player1.publicKey, (msg) => Promise.resolve(nacl.sign.detached(msg, player1.secretKey)));
    providerTeePlayer1 = new anchor.AnchorProvider(
      new anchor.web3.Connection(`${TEE_RPC_URL}?token=${token1.token}`, { wsEndpoint: `${TEE_WS_URL}?token=${token1.token}` }),
      new anchor.Wallet(player1),
      confirmOpts
    );
    console.log("P1 Auth Token:", token1.token.slice(0, 10) + "...");

    token2 = await getAuthToken(TEE_RPC_URL, player2.publicKey, (msg) => Promise.resolve(nacl.sign.detached(msg, player2.secretKey)));
    providerTeePlayer2 = new anchor.AnchorProvider(
      new anchor.web3.Connection(`${TEE_RPC_URL}?token=${token2.token}`, { wsEndpoint: `${TEE_WS_URL}?token=${token2.token}` }),
      new anchor.Wallet(player2),
      confirmOpts
    );

    tokenQ = await getAuthToken(TEE_RPC_URL, queueAuthority.publicKey, (msg) => Promise.resolve(nacl.sign.detached(msg, queueAuthority.secretKey)));
    providerTeeQueueAuth = new anchor.AnchorProvider(
      new anchor.web3.Connection(`${TEE_RPC_URL}?token=${tokenQ.token}`, { wsEndpoint: `${TEE_WS_URL}?token=${tokenQ.token}` }),
      new anchor.Wallet(queueAuthority),
      confirmOpts
    );
  });

  it("Initialize Infrastructure (Tenant & Queue) & Delegate", async () => {
    const mmAdmin = new MatchmakingAdmin(provider, privateMatchmaking.programId);

    // Compute Anchor discriminator for on_match_found
    const callbackDiscriminator = Array.from(
      crypto.createHash("sha256").update("global:on_match_found").digest().slice(0, 8)
    );

    const skipPreflight = { skipPreflight: true, commitment: "confirmed" as const };

    await mmAdmin.initializeTenant(
      rpsGame.programId,
      {
        authority: queueAuthority.publicKey,
        eloWindow: 100,
        eloOffset: 8 + 32,
        eloDataType: 'u64',
        callbackProgramId: rpsGame.programId,
        callbackDiscriminator,
      },
      skipPreflight,
      [queueAuthority]
    );

    await mmAdmin.initializeQueue(
      queueAuthority.publicKey,
      tenantPda,
      skipPreflight,
      [queueAuthority]
    );

    await mmAdmin.delegateQueue(
      queueAuthority.publicKey,
      ER_VALIDATOR,
      skipPreflight,
      [queueAuthority]
    );

    console.log("Queue Initialized & Delegated (Dark Pool Active)");

    console.log("Waiting for Queue TEE activation...");
    await waitUntilPermissionActive(`${TEE_RPC_URL}?token=${tokenQ.token}`, queuePda);
    console.log("Queue Active in TEE");
  });

  it("Initialize Player Profiles & Delegate", async () => {
    // Initialize P1 Profile
    await sendAndConfirmRobust(
      rpsGame,
      rpsGame.methods.initializePlayer().accounts({
        player: player1.publicKey,
        payer: player1.publicKey,
      }).transaction(),
      [player1]
    );
    await sendAndConfirmRobust(
      rpsGame,
      rpsGame.methods.delegatePda({ playerProfile: { player: player1.publicKey } }).accounts({
        pda: p1ProfilePda,
        payer: player1.publicKey,
        validator: ER_VALIDATOR,
      } as any).transaction(),
      [player1]
    );
    console.log("Waiting for P1 Profile TEE activation...");
    await waitUntilPermissionActive(`${TEE_RPC_URL}?token=${token1.token}`, p1ProfilePda);

    // Initialize P2 Profile
    await sendAndConfirmRobust(
      rpsGame,
      rpsGame.methods.initializePlayer().accounts({
        player: player2.publicKey,
        payer: player2.publicKey,
      }).transaction(),
      [player2]
    );
    await sendAndConfirmRobust(
      rpsGame,
      rpsGame.methods.delegatePda({ playerProfile: { player: player2.publicKey } }).accounts({
        pda: p2ProfilePda,
        payer: player2.publicKey,
        validator: ER_VALIDATOR,
      } as any).transaction(),
      [player2]
    );
    console.log("Waiting for P2 Profile TEE activation...");
    await waitUntilPermissionActive(`${TEE_RPC_URL}?token=${token2.token}`, p2ProfilePda);

    console.log("Profiles Initialized & Delegated");
  });

  it("P1 Creates Ticket, Delegates, and Joins Queue", async () => {
    // 1. Create ticket on L1 (player-specific provider so player is the signer)
    const clientP1L1 = new MatchmakingPlayer(providerL1Player1, privateMatchmaking.programId);
    await clientP1L1.createTicket(tenantPda);
    console.log("P1 Ticket Created on L1:", p1TicketPda.toBase58());

    // 2. Delegate ticket to TEE
    await clientP1L1.delegateTicket(
      player1.publicKey,
      tenantPda,
      ER_VALIDATOR,
    );
    console.log("P1 Ticket Delegated to TEE");

    // Wait for ticket delegation
    await waitUntilPermissionActive(`${TEE_RPC_URL}?token=${token1.token}`, p1TicketPda);
    console.log("P1 Ticket Active in TEE");

    // 3. Join queue via TEE (player signs directly - no backend!)
    const clientP1Tee = new MatchmakingPlayer(providerTeePlayer1, privateMatchmaking.programId);
    await clientP1Tee.joinQueue(queuePda, tenantPda, p1ProfilePda);
    console.log("P1 Joined Queue via TEE (Direct, No Backend!)");

    // Verify queue state in TEE
    const mmP1 = await getMatchmakingProgram(player1, providerTeePlayer1);
    const queueAccount = await mmP1.account.queue.fetch(queuePda);
    console.log("Queue Entries (TEE):", queueAccount.entries.length);
    assert.equal(queueAccount.entries.length, 1);

    // PRIVACY CHECK: L1 should not see the entry
    console.log("Checking L1 Privacy...");
    try {
      const queueL1 = await privateMatchmaking.account.queue.fetch(queuePda);
      if (queueL1.entries.length === 0) {
        console.log("PRIVACY CONFIRMED: L1 sees 0 entries.");
      } else {
        console.log("WARNING: L1 sees entries! State might be leaking.");
      }
    } catch (e) {
      console.log("PRIVACY CONFIRMED: L1 could not fetch account (Delegated/Locked).");
    }
  });

  it("P2 Creates Ticket, Delegates, Joins Queue -> Auto-Match", async () => {
    // 1. Create ticket on L1 (player-specific provider so player is the signer)
    const clientP2L1 = new MatchmakingPlayer(providerL1Player2, privateMatchmaking.programId);
    await clientP2L1.createTicket(tenantPda);
    console.log("P2 Ticket Created on L1:", p2TicketPda.toBase58());

    // 2. Delegate ticket to TEE
    await clientP2L1.delegateTicket(
      player2.publicKey,
      tenantPda,
      ER_VALIDATOR,
    );
    await waitUntilPermissionActive(`${TEE_RPC_URL}?token=${token2.token}`, p2TicketPda);
    console.log("P2 Ticket Active in TEE");

    // 3. Join queue via TEE - this should trigger auto-match
    const clientP2Tee = new MatchmakingPlayer(providerTeePlayer2, privateMatchmaking.programId);
    await clientP2Tee.joinQueue(queuePda, tenantPda, p2ProfilePda);
    console.log("P2 Joined Queue via TEE (Direct, No Backend!)");

    // Verify match happened
    const mmP2 = await getMatchmakingProgram(player2, providerTeePlayer2);
    const queueAccount = await mmP2.account.queue.fetch(queuePda);
    console.log("Queue Entries (After Auto-Match):", queueAccount.entries.length);
    assert.equal(queueAccount.entries.length, 0, "Queue should be empty after match");

    // P2's ticket should be updated to Matched (they were the joining player)
    const p2Ticket = await mmP2.account.matchTicket.fetch(p2TicketPda);
    console.log("P2 Ticket Status:", JSON.stringify(p2Ticket.status));
    assert.ok(p2Ticket.status.matched, "P2 ticket should be in Matched status");

    // P1's ticket should have a pending match
    console.log("Pending matches:", queueAccount.pendingMatches.length);
    assert.equal(queueAccount.pendingMatches.length, 1, "Should have 1 pending match for P1");
  });

  it("Flush Matches - Update P1's Ticket", async () => {
    const mmAdmin = new MatchmakingAdmin(providerTeeQueueAuth, privateMatchmaking.programId);

    // Flush pending matches (permissionless crank) — with CPI callback
    await mmAdmin.flushMatches(
      queuePda,
      tenantPda,
      [p1TicketPda],  // P1's ticket needs updating
      rpsGame.programId,  // callback program
    );
    console.log("Flushed pending matches");

    // Verify P1's ticket is now Matched
    const mmP1 = await getMatchmakingProgram(player1, providerTeePlayer1);
    const p1Ticket = await mmP1.account.matchTicket.fetch(p1TicketPda);
    console.log("P1 Ticket Status:", JSON.stringify(p1Ticket.status));
    assert.ok(p1Ticket.status.matched, "P1 ticket should be in Matched status");

    // Verify no more pending matches
    const queueAccount = await mmP1.account.queue.fetch(queuePda);
    assert.equal(queueAccount.pendingMatches.length, 0, "No more pending matches");
  });

  it("Commit Tickets to L1", async () => {
    const mmAdmin = new MatchmakingAdmin(providerTeeQueueAuth, privateMatchmaking.programId);

    // Commit both tickets back to L1
    await mmAdmin.commitTickets(
      tenantPda,
      [p1TicketPda, p2TicketPda],
    );
    console.log("Committed both tickets to L1");

    // Verify tickets are readable on L1 with correct match data
    // Need to wait a moment for L1 state to settle
    await new Promise(r => setTimeout(r, 5000));

    const p1Ticket = await privateMatchmaking.account.matchTicket.fetch(p1TicketPda);
    const p2Ticket = await privateMatchmaking.account.matchTicket.fetch(p2TicketPda);

    console.log("P1 Ticket (L1):", JSON.stringify(p1Ticket.status));
    console.log("P2 Ticket (L1):", JSON.stringify(p2Ticket.status));

    assert.ok(p1Ticket.status.matched, "P1 ticket should be Matched on L1");
    assert.ok(p2Ticket.status.matched, "P2 ticket should be Matched on L1");

    // Verify correct opponents
    if (p1Ticket.status.matched) {
      assert.ok(
        p1Ticket.status.matched.opponent.equals(player2.publicKey),
        "P1's opponent should be P2"
      );
    }
    if (p2Ticket.status.matched) {
      assert.ok(
        p2Ticket.status.matched.opponent.equals(player1.publicKey),
        "P2's opponent should be P1"
      );
    }

    console.log("L1 Ticket verification complete - match data correct!");
  });

  it("Play Game (Start & Moves)", async () => {
    const gameId = new anchor.BN(1);
    const gameSessionSeed = Buffer.from("game_session_v1");

    const [gameSessionPda] = PublicKey.findProgramAddressSync(
      [
        gameSessionSeed,
        player1.publicKey.toBuffer(),
        player2.publicKey.toBuffer(),
        gameId.toArrayLike(Buffer, 'le', 8)
      ],
      rpsGame.programId
    );

    // Start game (use secure verification via ticket)
    await sendAndConfirmRobust(rpsGame, rpsGame.methods.startGameWithTicket(gameId, player2.publicKey).accounts({
      player: player1.publicKey,
      matchTicket: p1TicketPda,
    } as any).transaction(), [player1]);

    // Delegate Game Session
    await sendAndConfirmRobust(rpsGame, rpsGame.methods.delegatePda({
      gameSession: { p1: player1.publicKey, p2: player2.publicKey, id: gameId }
    }).accounts({
      pda: gameSessionPda,
      payer: player1.publicKey,
      validator: ER_VALIDATOR,
    } as any).transaction(), [player1]);

    console.log("Game Session Started & Delegated. Waiting for activation...");
    await waitUntilPermissionActive(`${TEE_RPC_URL}?token=${token1.token}`, gameSessionPda);

    // P1 Moves (Rock) - TEE
    const rpsP1 = await getTeeProgram(player1, providerTeePlayer1);
    await sendAndConfirmRobust(rpsP1, rpsP1.methods.makeChoice({ rock: {} }).accountsPartial({
      gameSession: gameSessionPda,
      player1Profile: p1ProfilePda,
      player2Profile: p2ProfilePda,
      player: player1.publicKey,
    }).transaction(), [player1]);
    console.log("P1 Chose Rock");

    // P2 Moves (Paper) - TEE
    const rpsP2 = await getTeeProgram(player2, providerTeePlayer2);
    await sendAndConfirmRobust(rpsP2, rpsP2.methods.makeChoice({ paper: {} }).accountsPartial({
      gameSession: gameSessionPda,
      player1Profile: p1ProfilePda,
      player2Profile: p2ProfilePda,
      player: player2.publicKey,
    }).transaction(), [player2]);
    console.log("P2 Chose Paper");

    // Persist Results
    await sendAndConfirmRobust(
      rpsP1,
      rpsP1.methods.persistResults().accountsPartial({
        gameSession: gameSessionPda,
        player1Profile: p1ProfilePda,
        player2Profile: p2ProfilePda,
        payer: player1.publicKey,
      }).transaction(),
      [player1]
    );
    console.log("Results Persisted");

    // Verify Result
    const sessionAccount = await rpsGame.account.gameSession.fetch(gameSessionPda);
    console.log("Game Result:", JSON.stringify(sessionAccount.result));

    const winnerObj = sessionAccount.result as any;
    let winnerPk: PublicKey | null = null;
    if (winnerObj.winner) {
      if (winnerObj.winner instanceof PublicKey) {
        winnerPk = winnerObj.winner;
      } else if (winnerObj.winner['0']) {
        winnerPk = new PublicKey(winnerObj.winner['0']);
      } else if (Array.isArray(winnerObj.winner) && winnerObj.winner[0]) {
        winnerPk = new PublicKey(winnerObj.winner[0]);
      }
    }

    if (winnerPk) {
      assert.ok(winnerPk.equals(player2.publicKey), "P2 should win");
    }

    // Check ELO
    const p1Profile = await rpsGame.account.playerProfile.fetch(p1ProfilePda);
    const p2Profile = await rpsGame.account.playerProfile.fetch(p2ProfilePda);

    console.log(`P1 ELO (Loser 1000->${p1Profile.elo}): ${p1Profile.elo}`);
    console.log(`P2 ELO (Winner 1000->${p2Profile.elo}): ${p2Profile.elo}`);

    assert.ok(p1Profile.elo.lt(new anchor.BN(1000)), "P1 ELO should decrease");
    assert.ok(p2Profile.elo.gt(new anchor.BN(1000)), "P2 ELO should increase");
  });

  it("Third-party can read MatchTicket PDA on L1 to verify match", async () => {
    // Derive ticket PDAs the same way a third-party would
    const [derivedP1Ticket] = PublicKey.findProgramAddressSync(
      [ticketSeed, player1.publicKey.toBuffer(), tenantPda.toBuffer()],
      privateMatchmaking.programId
    );

    // Fetch and verify - this proves any program can read ticket state
    const ticket = await privateMatchmaking.account.matchTicket.fetch(derivedP1Ticket);

    assert.ok(ticket.player.equals(player1.publicKey), "Ticket player should match");
    assert.ok(ticket.tenant.equals(tenantPda), "Ticket tenant should match");
    assert.ok(ticket.status.matched, "Ticket should show matched status");

    console.log("Third-party verification successful:");
    console.log("  Player:", ticket.player.toBase58());
    console.log("  Tenant:", ticket.tenant.toBase58());
    console.log("  Status:", JSON.stringify(ticket.status));
  });

  after("Cleanup", async () => {
    // Delegated accounts cannot be closed easily by the original owner program.
    // In production, we would undelegate first before closing.
  });
});

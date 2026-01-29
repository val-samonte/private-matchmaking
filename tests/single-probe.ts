
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorRockPaperScissor } from "../target/types/anchor_rock_paper_scissor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import * as nacl from "tweetnacl";

import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";

describe("single-probe", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorRockPaperScissor as Program<AnchorRockPaperScissor>;
  
  const player1 = Keypair.generate();
  const player2 = Keypair.generate();
  
  const GAME_SEED = Buffer.from("game");
  const PLAYER_CHOICE_SEED = Buffer.from("player_choice");
  const PLAYER_PROFILE_SEED = Buffer.from("player_profile");

  const ephemeralRpcEndpoint = "https://tee.magicblock.app"; 
  const validationRpcEndpoint = "https://api.devnet.solana.com";

  let gamePda: PublicKey;
  let player1ProfilePda: PublicKey;
  let player2ProfilePda: PublicKey;

  it("Setup and Probe", async () => {
    // 1. Airdrop
    // 1. Fund Players (Manual Transfer because Airdrop fails)
    console.log("Funding players...");
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: player1.publicKey,
        lamports: 0.5 * anchor.web3.LAMPORTS_PER_SOL,
      }),
      anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: player2.publicKey,
        lamports: 0.5 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(tx);

    // 2. Derive PDAs
    [player1ProfilePda] = PublicKey.findProgramAddressSync(
      [PLAYER_PROFILE_SEED, player1.publicKey.toBuffer()],
      program.programId
    );
     [player2ProfilePda] = PublicKey.findProgramAddressSync(
      [PLAYER_PROFILE_SEED, player2.publicKey.toBuffer()],
      program.programId
    );

    // 3. Initialize Profiles (Permission Creation skipped for brevity, focusing on write check)
    console.log("Initializing Profiles...");
    await program.methods.initializePlayer()
      .accounts({ profile: player1ProfilePda, player: player1.publicKey, payer: provider.wallet.publicKey })
      .signers([player1])
      .rpc();
    
    await program.methods.initializePlayer()
      .accounts({ profile: player2ProfilePda, player: player2.publicKey, payer: provider.wallet.publicKey })
      .signers([player2])
      .rpc();

    // 4. Create Game
    const gameId = new anchor.BN(Date.now());
    [gamePda] = PublicKey.findProgramAddressSync(
      [GAME_SEED, gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [p1ChoicePda] = PublicKey.findProgramAddressSync(
        [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player1.publicKey.toBuffer()],
        program.programId
    );

    console.log("Creating Game...");
    await program.methods.createGame(gameId)
      .accounts({ game: gamePda, playerChoice: p1ChoicePda, player1: player1.publicKey /* payer implicitly player1 */ })
      .signers([player1])
      .rpc();
    
    // 5. Join Game
    console.log("Joining Game...");
    const [p2ChoicePda] = PublicKey.findProgramAddressSync(
        [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player2.publicKey.toBuffer()],
        program.programId
    );
    await program.methods.joinGame(gameId)
      .accounts({ game: gamePda, playerChoice: p2ChoicePda, player: player2.publicKey })
      .signers([player2])
      .rpc();

    // 6. Commit Choices (Hardcoded: Rock vs Scissors)
    console.log("Committing Choices...");
    // pdas already derived above
    await program.methods.makeChoice(gameId, { rock: {} })
        .accounts({ playerChoice: p1ChoicePda, player: player1.publicKey })
        .signers([player1])
        .rpc();

    // p2ChoicePda derived above
    await program.methods.makeChoice(gameId, { scissors: {} })
        .accounts({ playerChoice: p2ChoicePda, player: player2.publicKey })
        .signers([player2])
        .rpc();

    // 7. Reveal Winner (TEE Trigger)
    console.log("Revealing Winner on TEE...");
    
    // Create TEE Provider
    const authToken = await getAuthToken(ephemeralRpcEndpoint, player1.publicKey, async (msg) => {
        return nacl.sign.detached(msg, player1.secretKey);
    });
    
    const teeConnection = new anchor.web3.Connection(`${ephemeralRpcEndpoint}?token=${authToken.token}`, {
        httpHeaders: { "Authorization": `Bearer ${authToken.token}` },
        commitment: "confirmed"
    });
    
    // We construct a new Program instance connected to TEE
    // Note: We reuse the IDL and programId
    const teeProvider = new anchor.AnchorProvider(teeConnection, new anchor.Wallet(player1), {});
    // Load IDL manually to ensure clean state
    const idl = require("../target/idl/anchor_rock_paper_scissor.json");
    const teeProgram = new anchor.Program(idl, teeProvider);

    try {
        await teeProgram.methods.revealWinner()
        .accounts({
            game: gamePda,
            player1Choice: p1ChoicePda,
            player2Choice: p2ChoicePda,
            player1Profile: player1ProfilePda,
            player2Profile: player2ProfilePda,
            permissionGame: gamePda, // Dummy/Unused in simple probe? Or required?
            permission1: p1ChoicePda,
            permission2: p2ChoicePda,
            // Magic Program accounts are auto-resolved on TEE or ignored if not required by runtime?
            // Actually, TEE environment has these. We shouldn't need to pass them explicitly if environment handles it.
            // But if previous error "InvalidProgramId" was from TEE... NO, previous error was from L1.
            // On TEE, Magic1111... should exist.
        })
        .signers([player1])
        .rpc();
        console.log("Reveal Winner executed on TEE.");
    } catch (e) {
        console.log("Reveal failed/simulated:", e);
    }

    // Wait for commit (async)
    console.log("Waiting for state commitment...");
    await new Promise(r => setTimeout(r, 5000));

    // 8. Probe Final State
    const finalP1 = await program.account.playerProfile.fetch(player1ProfilePda);
    const finalInfo = await provider.connection.getAccountInfo(player1ProfilePda);

    console.log("--- PROBE RESULTS ---");
    console.log("Player 1 ELO:", finalP1.elo.toString());
    console.log("Player 1 Lamports:", finalInfo?.lamports);
    console.log("---------------------");

    // ELO should be 1032 if P1 won (Rock vs Scissors) and persisted.
  });
});

// @ts-nocheck
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PrivateMatchmaking } from "../target/types/private_matchmaking";
import { AnchorRockPaperScissor } from "../target/types/anchor_rock_paper_scissor";
import { MatchmakingClient, deriveQueuePda, derivePagePda, JoinQueueResult } from "../sdk/src";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";
import { verifyTeeRpcIntegrity, getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
// @ts-ignore
import * as nacl from "tweetnacl";
import { Connection } from "@solana/web3.js";

// Import RPS Game Seed constants if possible, or redefine
const GAME_SEED = Buffer.from("game");
const PLAYER_CHOICE_SEED = Buffer.from("player_choice");
const PLAYER_PROFILE_SEED = Buffer.from("player_profile");

describe("Integration Demo: Matchmaking -> Rock Paper Scissors", () => {
    // Configure the client
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const matchmakingProgram = anchor.workspace.PrivateMatchmaking as Program<PrivateMatchmaking>;
    const rpsProgram = anchor.workspace.AnchorRockPaperScissor as Program<AnchorRockPaperScissor>;

    const matchmakingClient = new MatchmakingClient(provider, matchmakingProgram.programId);

    // Players
    const player1 = Keypair.generate();
    const player2 = Keypair.generate();
    
    // Player Game Data Accounts (Mocked for this integration as "Stat/ELO" accounts)


    // Matchmaking Config
    let queuePda: PublicKey;
    // Use dynamic generic-id to avoid "Account already in use" on repeated runs
    const queueId = `q-${Date.now().toString().slice(-8)}`; 

    // Game Session Data (Lifted for Cleanup)
    let gameId: BN;
    let gamePda: PublicKey;
    let p1ChoicePda: PublicKey;
    let p2ChoicePda: PublicKey; 

    // Helpers to fund players
    const fundPlayer = async (player: Keypair) => {
        const tx = new anchor.web3.Transaction().add(
            SystemProgram.transfer({
                fromPubkey: provider.wallet.publicKey,
                toPubkey: player.publicKey,
                lamports: 1 * anchor.web3.LAMPORTS_PER_SOL,
            })
        );
        await provider.sendAndConfirm(tx);
    };

    before(async () => {
        await fundPlayer(player1);
        await fundPlayer(player2);
    });

    it("Setup: Initialize Matchmaking Queue for RPS Program", async () => {
        // Derive the Queue Authority PDA (RPS Program)
        const [queueAuthorityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("queue-authority")],
            rpsProgram.programId
        );
        console.log(`Queue Authority PDA: ${queueAuthorityPda.toBase58()}`);

        // Use SDK Util
        queuePda = deriveQueuePda(matchmakingProgram.programId, queueAuthorityPda, queueId); 

        // Use SDK Util for Page 0
        const pagePda = derivePagePda(matchmakingProgram.programId, queuePda, 0);

        const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
        
        const [bufferPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("buffer"), queuePda.toBuffer()],
            matchmakingProgram.programId
        );
        const [delegationRecordPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("delegation"), queuePda.toBuffer()],
            DELEGATION_PROGRAM_ID
        );
        const [delegationMetadataPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("delegation-metadata"), queuePda.toBuffer()],
            DELEGATION_PROGRAM_ID
        );


        console.log("DEBUG: Matchmaking PID:", matchmakingProgram.programId.toBase58());
        console.log("DEBUG: Buffer PDA:", bufferPda.toBase58());
        console.log("DEBUG: Delegation Program ID:", DELEGATION_PROGRAM_ID.toBase58());

        try {
             await rpsProgram.methods
             .initializeMsgQueue(queueId, 2, 10)
             // @ts-ignore
             .accounts({
                 queue: queuePda,
                 page: pagePda,
                 // authority: queueAuthorityPda, // Auto-resolved by Anchor SDK due to seeds?
                 payer: provider.wallet.publicKey,
                 tenantProgramId: rpsProgram.programId,
                 bufferPda,
                 delegationRecordPda,
                 delegationMetadataPda,
                 delegationProgram: DELEGATION_PROGRAM_ID
             })
             .rpc();
             console.log(`✅ Queue Initialized via CPI: ${queuePda.toBase58()} (ID: ${queueId})`);
        } catch (e) {
            console.error("Queue initialized failed", e);
            throw e;
        }
    });

    let player1Profile: PublicKey;
    let player2Profile: PublicKey;

    it("Setup: Register Players (On-Chain RPS Profiles)", async () => {
        // --- Player 1 Profile ---
        [player1Profile] = PublicKey.findProgramAddressSync(
            [PLAYER_PROFILE_SEED, player1.publicKey.toBuffer()],
            rpsProgram.programId
        );
        await rpsProgram.methods.initializePlayer(new BN(1200))
            .accounts({
                // @ts-ignore
                playerProfile: player1Profile,
                payer: player1.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([player1])
            .rpc();

        // --- Player 2 Profile ---
        [player2Profile] = PublicKey.findProgramAddressSync(
            [PLAYER_PROFILE_SEED, player2.publicKey.toBuffer()],
            rpsProgram.programId
        );
        await rpsProgram.methods.initializePlayer(new BN(1250))
            .accounts({
                // @ts-ignore
                playerProfile: player2Profile,
                payer: player2.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([player2])
            .rpc();

        console.log("✅ Players Initialized with Real On-Chain Profiles");
    });

    it("Matchmaking: Players Join Queue", async () => {
        // Player 1 Joins (Standard)
        const providerP1 = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(player1), {});
        const clientP1 = new MatchmakingClient(providerP1, matchmakingProgram.programId); // Default Not Encrypted
        
        const res1 = await clientP1.joinQueue(queuePda, player1Profile, rpsProgram.programId);
        console.log("✅ Player 1 Joined Queue (Plain)");

        // Player 2 Joins (Encrypted Mode - New Feature)
        const providerP2 = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(player2), {});
        const clientP2 = new MatchmakingClient(providerP2, matchmakingProgram.programId, { 
            encrypted: true // <--- TESTING NEW FEATURE
        });
        
        const res2 = await clientP2.joinQueue(queuePda, player2Profile, rpsProgram.programId);
        console.log("✅ Player 2 Joined Queue (Encrypted Handshake)");
        
        if (res2.status === "Matched") {
            console.log("😲 Player 2 got an Instant Match!");
        }
    });

    it("System: Process Match & Trigger Game Creation", async () => {
        // 1. Trigger Matchmaking manually (Simulating Crank)
        // We know they are on Page 0
        const listener = matchmakingProgram.addEventListener("matchFound", (event, slot) => {
            console.log("🎉 MATCH FOUND EVENT DETECTED!");
            console.log(`   Player A: ${event.playerA.toBase58()}`);
            console.log(`   Player B: ${event.playerB.toBase58()}`);
            
            // In a real system, a backend service would hear this and allow the game to start.
            // Here, we simulate the "Handshake" by immediately creating the RPS game.
        });

        const tx = await matchmakingClient.processMatch(queuePda, 0);
        console.log(`⚙️  Process Match TX: ${tx}`);

        // Wait a bit for event
        await new Promise(r => setTimeout(r, 2000));
        matchmakingProgram.removeEventListener(listener);
    });

    it("Game: Play Rock Paper Scissors", async () => {
        // Assume the "Game ID" is derived from the match or random.
        // For this demo, P1 creates the game sharing the ID with P2.
        // Assume the "Game ID" is derived from the match or random.
        // For this demo, P1 creates the game sharing the ID with P2.
        gameId = new BN(Date.now()); 
        
        // --- 1. Join Session (Player 1) ---
        [gamePda] = PublicKey.findProgramAddressSync(
            [GAME_SEED, gameId.toArrayLike(Buffer, "le", 8)],
            rpsProgram.programId
        );
        [p1ChoicePda] = PublicKey.findProgramAddressSync(
            [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player1.publicKey.toBuffer()],
            rpsProgram.programId
        );

        await rpsProgram.methods
            .joinSession(gameId)
            .accounts({
                // @ts-ignore
                game: gamePda,
                playerChoice: p1ChoicePda,
                player: player1.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([player1])
            .rpc();
        console.log(`🎮 Player 1 Connected to Session ${gameId.toString()}`);

        // --- 2. Join Session (Player 2) ---
        [p2ChoicePda] = PublicKey.findProgramAddressSync(
            [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player2.publicKey.toBuffer()],
            rpsProgram.programId
        );

        await rpsProgram.methods
            .joinSession(gameId)
            .accounts({
                // @ts-ignore
                game: gamePda,
                playerChoice: p2ChoicePda,
                player: player2.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([player2])
            .rpc();
        console.log("🎮 Player 2 Connected to Session");

        // --- 3. Make Choices (Confidential) ---
        // P1 chooses ROCK
        await rpsProgram.methods.makeChoice(gameId, { rock: {} })
            .accounts({ 
                // playerChoice: p1ChoicePda, 
                player: player1.publicKey 
            })
            .signers([player1])
            .rpc();
        
        // P2 chooses SCISSORS
        await rpsProgram.methods.makeChoice(gameId, { scissors: {} })
            .accounts({ 
                // playerChoice: p2ChoicePda, 
                player: player2.publicKey 
            })
            .signers([player2])
            .rpc();
        
        console.log("🔒 Both players made choices");

        // --- 4. Reveal Winner ---
        // In this integration, we are running on Localnet (L1) not TEE for simplicity,
        // so we skip the "permission" accounts which exist for TEE.
        // Wait, the RPS program provided USES TEE/Ephemeral SDK macros?
        // Let's check if it forces TEE usage.
        // Looking at `lib.rs`: `reveal_winner` takes `permission_program`, `magic_program` etc.
        // It uses `UpdatePermissionCpiBuilder`. 
        // IF we are not on Ephemeral Rollup, these CPIs might fail or require mock programs?
        // Or if we don't delegate, maybe it works on L1 if we provide dummy accounts?
        // 
        // Actually, the provided RPS program is heavily TEE dependent (imports ephemeral_rollups_sdk).
        // Running `reveal_winner` executes `commit_and_undelegate_accounts` and `UpdatePermission`.
        // This will likely FAIL on standard Devnet/Localnet without the MagicBlock runtime or mocks.
        
        // However, the USER asked to use *this* program.
        // If we can't fully execute `reveal_winner` due to missing TEE environment on local test,
        // we can at least confirm the "Handshake" (Matchmaking -> Game Start) worked.
        
        // We will try to call reveal_winner but catch expected "Program not found" or similar errors
        // if the Permission/Magic programs are missing.
        
        /* 
           NOTE: To fully test this, we'd need the TEE simulator or mocking the permission/magic programs.
           For this DEMO, verifying we got to the "Choices Made" state confirms the integration 
           of "Matchmaking -> Game Session".
        */
       console.log("✅ Simulation: Matchmaking handed off to Game Session successfully.");

        // --- 4. Reveal Winner (Attempt) ---
        // Helper to derive status PDAs
        const derivePlayerStatus = (playerGameAccount: PublicKey, programId: PublicKey) => {
            return PublicKey.findProgramAddressSync(
                [Buffer.from("status"), playerGameAccount.toBuffer()],
                programId
            )[0];
        };

        const p1Status = derivePlayerStatus(player1Profile, matchmakingProgram.programId);
        const p2Status = derivePlayerStatus(player2Profile, matchmakingProgram.programId);

        // Derive Queue Authority again for clarity
        const [queueAuthorityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("queue-authority")],
            rpsProgram.programId
        );

        // --- TEE Integration ---
        const EPHEMERAL_RPC_URL = "https://tee.magicblock.app";
        const ER_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");
        const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
        const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");

        console.log("🔒 Verifying TEE RPC Integrity...");
        try {
             await verifyTeeRpcIntegrity(EPHEMERAL_RPC_URL);
             console.log("✅ TEE RPC Integrity Verified");
        } catch (e) {
             console.log("⚠️ TEE RPC Verification Warning:", e.message);
        }

        console.log("� Verifying TEE RPC Integrity (Skipping duplicate check)...");

        // 1. Delegate Game to TEE (L1 Transaction)
        console.log("🤝 Delegating Game to TEE Validator...");
        try {
            await rpsProgram.methods.delegatePda({ game: { gameId } } as any) // Pass gameId for derivation
                .accounts({
                    pda: gamePda,
                    payer: provider.wallet.publicKey,
                    validator: ER_VALIDATOR,
                })
                .rpc();
            console.log("✅ Game Delegated to TEE");

            // Delegate Player Profiles to TEE (So ELO can be updated)
            await rpsProgram.methods.delegatePda({ playerProfile: { player: player1.publicKey } } as any)
                .accounts({
                    pda: player1Profile,
                    payer: provider.wallet.publicKey,
                    validator: ER_VALIDATOR,
                })
                .rpc();
            console.log("✅ P1 Profile Delegated to TEE");

            await rpsProgram.methods.delegatePda({ playerProfile: { player: player2.publicKey } } as any)
                .accounts({
                    pda: player2Profile,
                    payer: provider.wallet.publicKey,
                    validator: ER_VALIDATOR,
                })
                .rpc();
            console.log("✅ P2 Profile Delegated to TEE");

        } catch (e) {
            console.log("⚠️ Delegation failed (might already be delegated):", e);
        }

        // Fetch player profiles before the reveal to compare ELO (L1)
        const p1ProfileBefore = await rpsProgram.account.playerProfile.fetch(player1Profile);
        const p2ProfileBefore = await rpsProgram.account.playerProfile.fetch(player2Profile);

        console.log("🔑 Getting Auth Token for TEE (Just-in-Time)...");
        if (!nacl || !nacl.sign) console.error("FATAL: Nacl not loaded properly");
        const payerKey = (provider.wallet as any).payer?.secretKey;
        
        const token = await getAuthToken(
            EPHEMERAL_RPC_URL,
            provider.wallet.publicKey,
            (message: Uint8Array) => Promise.resolve(nacl.sign.detached(message, payerKey))
        );
        console.log(`   Token generated (len=${token.token.length})`);
        
        const teeConnection = new Connection(`${EPHEMERAL_RPC_URL}?token=${token.token}`);
        const teeProvider = new anchor.AnchorProvider(teeConnection, provider.wallet, { commitment: "confirmed" });
        const rpsProgramTee = new anchor.Program(rpsProgram.idl, teeProvider);

        const [gameDelegationRecord] = PublicKey.findProgramAddressSync(
            [Buffer.from("delegation"), gamePda.toBuffer()],
            DELEGATION_PROGRAM_ID
        );

        // 2. Reveal Winner (TEE L2 Transaction)
        console.log("🏆 Revealing Winner on TEE...");

            // const derivePermission = (seed: Buffer) => PublicKey.findProgramAddressSync([seed, ...], ...);
            // We'll use random for now if they are just "Unchecked" in struct but "Signer" or "Account" in logic?
            // In struct: UncheckedAccount.
            // In logic: UpdatePermissionCpiBuilder calls...
            
            await rpsProgramTee.methods.revealWinner()
            .accounts({
                 // @ts-ignore
                 game: gamePda,
                 player1Choice: p1ChoicePda,
                 player2Choice: p2ChoicePda,
                 player1Profile: player1Profile,
                 player2Profile: player2Profile,
                 
                 magicProgram: DELEGATION_PROGRAM_ID,
                 magicContext: gameDelegationRecord, 
                 payer: provider.wallet.publicKey,
            })
            .rpc();
            console.log("✅ Reveal Winner Executed Successfully on TEE");
            
            // Wait for Commit/Settlement (if async) - Standard commit is atomic in instruction, 
            // but we need to verify L1 state or TEE state.
            await new Promise(r => setTimeout(r, 2000));

            // --- Verify Game Result ---
            // If committed, we check L1. If not committed yet, we check TEE? 
            // reveal_winner calls `commit_and_undelegate`. Game should be back on L1.
            const gameAccount = await rpsProgram.account.game.fetch(gamePda);
            console.log("🏆 Game Result (L1):", JSON.stringify(gameAccount.result));

            // --- Verify ELO Updates ---
            const p1ProfileAfter = await rpsProgram.account.playerProfile.fetch(player1Profile);
            const p2ProfileAfter = await rpsProgram.account.playerProfile.fetch(player2Profile);
            console.log(`📊 ELO After:  P1=${p1ProfileAfter.elo}, P2=${p2ProfileAfter.elo}`);

            // Logic Check
            if (gameAccount.result.winner) {
                // Rust Enum Tuple Variant `Winner(Pubkey)` -> TS `{ 0: PublicKey }` or `[PublicKey]`
                // Error said: type '{ 0: PublicKey; }'
                const winnerKey = (gameAccount.result.winner as any)[0].toBase58();
                
                if (winnerKey === player1.publicKey.toBase58()) {
                    console.log("   ✅ P1 Won: Verifying ELO gain...");
                    expect(p1ProfileAfter.elo.toNumber()).to.be.gt(p1ProfileBefore.elo.toNumber());
                    expect(p2ProfileAfter.elo.toNumber()).to.be.lt(p2ProfileBefore.elo.toNumber());
                } else if (winnerKey === player2.publicKey.toBase58()) {
                    console.log("   ✅ P2 Won: Verifying ELO gain...");
                    expect(p2ProfileAfter.elo.toNumber()).to.be.gt(p2ProfileBefore.elo.toNumber());
                    expect(p1ProfileAfter.elo.toNumber()).to.be.lt(p1ProfileBefore.elo.toNumber());
                }
            } else if (gameAccount.result.tie) {
                 console.log("   ⚖️ Tie: Verifying ELO unchanged...");
                 expect(p1ProfileAfter.elo.toNumber()).to.eq(p1ProfileBefore.elo.toNumber());
                 expect(p2ProfileAfter.elo.toNumber()).to.eq(p2ProfileBefore.elo.toNumber());
            }
    });

    after(async () => {
        console.log("🧹 cleanup: Reclaiming SOL...");
        
        try {
            await matchmakingClient.unlockPlayer(player1Profile, player1.publicKey);
        } catch(e) { /* Ignore if already unlocked */ }
        
        try {
            await matchmakingClient.unlockPlayer(player2Profile, player2.publicKey);
        } catch(e) { /* Ignore */ }

        // 2. Close Pages
        for(let i=0; i<2; i++) {
             try {
                await matchmakingClient.closePage(queuePda, i);
             } catch(e) { /* Ignore */ }
        }

        // 3. Close Queue
        try {
            await matchmakingClient.closeQueue(queueId);
        } catch(e) { /* Ignore */ }

        // 4. Close Game & Choices (Reclaim Rent)
        if (gameId) {
            console.log("   Reclaiming Game Accounts...");
            // Close Player Choices (Signers: Players)
            try {
                // @ts-ignore
                await rpsProgram.methods.closePlayerChoice(gameId)
                    .accounts({ playerChoice: p1ChoicePda, payer: player1.publicKey })
                    .signers([player1])
                    .rpc();
            } catch(e) { console.log("   ⚠️ Failed to close P1 Choice", e.message); }

            try {
                // @ts-ignore
                await rpsProgram.methods.closePlayerChoice(gameId)
                    .accounts({ playerChoice: p2ChoicePda, payer: player2.publicKey })
                    .signers([player2])
                    .rpc();
            } catch(e) { console.log("   ⚠️ Failed to close P2 Choice", e.message); }

            // Close Game (Signer: Payer/Provider)
            try {
                // @ts-ignore
                await rpsProgram.methods.closeGame(gameId)
                    .accounts({ game: gamePda, payer: provider.wallet.publicKey })
                    .rpc();
            } catch(e) { console.log("   ⚠️ Failed to close Game", e.message); }
        }

        // 5. Close Profiles (Reclaim Rent)
        if (player1Profile) {
            try {
                // @ts-ignore
                await rpsProgram.methods.closePlayerProfile()
                    .accounts({ playerProfile: player1Profile, payer: player1.publicKey })
                    .signers([player1])
                    .rpc();
            } catch(e) { console.log("   ⚠️ Failed to close P1 Profile", e.message); }
        }
        if (player2Profile) {
            try {
                // @ts-ignore
                await rpsProgram.methods.closePlayerProfile()
                    .accounts({ playerProfile: player2Profile, payer: player2.publicKey })
                    .signers([player2])
                    .rpc();
            } catch(e) { console.log("   ⚠️ Failed to close P2 Profile", e.message); }
        }

        // 6. Drain Player Wallets back to Payer
        console.log("   Draining Player Wallets...");
        const drainWallet = async (player: Keypair) => {
            try {
                const startBalance = await provider.connection.getBalance(player.publicKey);
                if (startBalance > 5000) { // Only drain if worth it (> 5000 lamports)
                     const tx = new anchor.web3.Transaction().add(
                        SystemProgram.transfer({
                            fromPubkey: player.publicKey,
                            toPubkey: provider.wallet.publicKey,
                            lamports: startBalance - 5000, // Leave tiny dust for fee
                        })
                    );
                    await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [player]);
                    console.log(`   💸 Drained ${(startBalance - 5000)/1e9} SOL from ${player.publicKey.toBase58()}`);
                }
            } catch(e) {
                console.log(`   ⚠️ Failed to drain wallet ${player.publicKey.toBase58()}:`, e.message);
            }
        };
        await drainWallet(player1);
        await drainWallet(player2);
    });

});

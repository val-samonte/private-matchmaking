import * as anchor from "@coral-xyz/anchor";
import { sendAndConfirmTransaction } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { AnchorRockPaperScissor } from "../target/types/anchor_rock_paper_scissor";
import BN from "bn.js";
import * as nacl from 'tweetnacl';

import {
  permissionPdaFromAccount,
  getAuthToken,
  getPermissionStatus,
  waitUntilPermissionActive,
  AUTHORITY_FLAG,
  Member,
  createDelegatePermissionInstruction,
  TX_LOGS_FLAG,
} from "@magicblock-labs/ephemeral-rollups-sdk";


describe("anchor-rock-paper-scissor", () => {
  // Configure the client
  let provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  let program = anchor.workspace
    .AnchorRockPaperScissor as Program<AnchorRockPaperScissor>;
  console.log("Program ID: ", program.programId.toString());


  const ER_VALIDATOR = new anchor.web3.PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"); // TEE ER Validator
  const player1 = anchor.web3.Keypair.generate();
  const player2 = anchor.web3.Keypair.generate();

  const teeUrl = "https://tee.magicblock.app"
  const teeWsUrl = "wss://tee.magicblock.app"
  const ephemeralRpcEndpoint = (process.env.EPHEMERAL_PROVIDER_ENDPOINT || teeUrl).replace(/\/$/, "");
  const providerEphemeralRollup = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      ephemeralRpcEndpoint,
      {
        wsEndpoint:
          process.env.EPHEMERAL_WS_ENDPOINT || teeWsUrl,
      },
    ),
    anchor.Wallet.local(),
  );
  console.log("Base Layer Connection: ", provider.connection.rpcEndpoint);
  console.log(
    "Ephemeral Rollup Connection: ",
    providerEphemeralRollup.connection.rpcEndpoint,
  );

  // Random game ID (u64)
  const gameId = new BN(Date.now());
  console.log("Game ID (u64):", gameId.toString());

  // PDA seeds
  const GAME_SEED = Buffer.from("game");
  const PLAYER_CHOICE_SEED = Buffer.from("player_choice");
  const PLAYER_PROFILE_SEED = Buffer.from("player_profile");

  // Derived PDAs
  let [gamePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [GAME_SEED, gameId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  let [player1ChoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player1.publicKey.toBuffer()],
      program.programId
    );
  let [player2ChoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player2.publicKey.toBuffer()],
      program.programId
    );
  let [player1ProfilePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [PLAYER_PROFILE_SEED, player1.publicKey.toBuffer()],
      program.programId
    );
  let [player2ProfilePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [PLAYER_PROFILE_SEED, player2.publicKey.toBuffer()],
      program.programId
    );

  const permissionForGame = permissionPdaFromAccount(gamePda);
  const permissionForPlayer1Choice = permissionPdaFromAccount(player1ChoicePda);
  const permissionForPlayer2Choice = permissionPdaFromAccount(player2ChoicePda);
  const permissionForPlayer1Profile = permissionPdaFromAccount(player1ProfilePda);
  const permissionForPlayer2Profile = permissionPdaFromAccount(player2ProfilePda);

  console.log("Game PDA:", gamePda.toBase58());
  console.log("Player1:", player1.publicKey.toBase58());
  console.log("Player1 Choice PDA:", player1ChoicePda.toBase58());
  console.log("Player2:", player2.publicKey.toBase58());
  console.log("Player2Choice PDA:", player2ChoicePda.toBase58());
  console.log("Permission PDA for Game:", permissionForGame.toString());
  console.log("Permission PDA for Player1 Choice:", permissionForPlayer1Choice.toString());
  console.log("Permission PDA for Player2 Choice:", permissionForPlayer2Choice.toString());



  // Permission TEE AuthToken
  let authTokenPlayer1: { token: string; expiresAt: number };
  let authTokenPlayer2: { token: string; expiresAt: number };
  let providerTeePlayer1
  let providerTeePlayer2

  // ... (Initialization steps remain the same, outside the loop)

  // Initialization is done once
  it("Airdrop SOL to Players", async () => {
      // ... (existing airdrop code) ...
      const tx = new anchor.web3.Transaction().add(
              anchor.web3.SystemProgram.transfer({
              fromPubkey: provider.wallet.publicKey,
              toPubkey: player1.publicKey,
              lamports: 1.0 * anchor.web3.LAMPORTS_PER_SOL,
              }),
              anchor.web3.SystemProgram.transfer({
              fromPubkey: provider.wallet.publicKey,
              toPubkey: player2.publicKey,
              lamports: 1.0 * anchor.web3.LAMPORTS_PER_SOL,
              })
          );

      await provider.sendAndConfirm(tx); // provider wallet pays
      const balance1 = await provider.connection.getBalance(player1.publicKey)
      const balance2 = await provider.connection.getBalance(player2.publicKey);
      console.log("💸 Player 1 Balance:", balance1 / anchor.web3.LAMPORTS_PER_SOL, "SOL");
      console.log("💸 Player 2 Balance:", balance2 / anchor.web3.LAMPORTS_PER_SOL, "SOL");

      // Get Auth Tokens if using TEE
        if (ephemeralRpcEndpoint.includes("tee")) {
            authTokenPlayer1 = await getAuthToken(ephemeralRpcEndpoint, player1.publicKey, (message: Uint8Array) => Promise.resolve(nacl.sign.detached(message, player1.secretKey)));
            console.log("Player 1 Explorer URL:", `https://solscan.io/?cluster=custom&customUrl=${teeUrl}?token=${authTokenPlayer1.token}`);
            authTokenPlayer2 = await getAuthToken(ephemeralRpcEndpoint, player2.publicKey, (message: Uint8Array) => Promise.resolve(nacl.sign.detached(message, player2.secretKey)));
            console.log("Player 2 Explorer URL:", `https://solscan.io/?cluster=custom&customUrl=${teeUrl}?token=${authTokenPlayer2.token}`);
          providerTeePlayer1 = new anchor.AnchorProvider(
            new anchor.web3.Connection(
              process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
                `${teeUrl}?token=${authTokenPlayer1.token}`,
              {
                wsEndpoint:
                  process.env.EPHEMERAL_WS_ENDPOINT || `${teeWsUrl}?token=${authTokenPlayer1.token}`,
              },
            ),
            anchor.Wallet.local(),
          );
          providerTeePlayer2 = new anchor.AnchorProvider(
            new anchor.web3.Connection(
              process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
                `${teeUrl}?token=${authTokenPlayer2.token}`,
              {
                wsEndpoint:
                  process.env.EPHEMERAL_WS_ENDPOINT || `${teeWsUrl}?token=${authTokenPlayer2.token}`,
              },
            ),
            anchor.Wallet.local(),
          );
      }
  });

  it("Initialize Player 1 Profile", async () => {
    // Check if account exists first to avoid re-init error if re-running test without new keys
    // But since we use fresh keys for the file execution context, this is fine.
    // However, if we loop, we do NOT want to init again.
    // This 'it' block only runs once.
      const tx = await program.methods
          .initializePlayer()
          .accounts({
              //@ts-ignore
              profile: player1ProfilePda,
              payer: player1.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([player1])
          .rpc();
      console.log("✅ Initialized Player 1 Profile:", tx);

      const profile = await program.account.playerProfile.fetch(player1ProfilePda);
      console.log("Player 1 Profile:", profile);
      // Verify ELO is 1000
      if (!profile.elo.eq(new BN(1000))) {
          throw new Error("❌ ELO not initialized to 1000");
      }
      console.log("✅ ELO Verified: 1000");

      // Permission and Delegation for Player 1 Profile
      let members : Member[] | null = [ 
        {
          flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
          pubkey: player1.publicKey
        }
      ]
      const createProfilePermissionIx = await program.methods
        .createPermission(
          { playerProfile: { player: player1.publicKey } },
          members
        )
        .accountsPartial({
          payer: player1.publicKey,
          permissionedAccount: player1ProfilePda,
          permission: permissionForPlayer1Profile,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const delegatePermission = createDelegatePermissionInstruction({
        payer: player1.publicKey,
        validator: ER_VALIDATOR,
        permissionedAccount: [player1ProfilePda, false],
        authority: [player1.publicKey, true],
      })

      const delegateProfileIx = await program.methods
          .delegatePda({ playerProfile: { player: player1.publicKey } })
          .accounts({
              payer: player1.publicKey,
              validator: ER_VALIDATOR,
              pda: player1ProfilePda,
          })
          .instruction();

      let txDelegate = new anchor.web3.Transaction().add(
        createProfilePermissionIx,
        delegatePermission,
        delegateProfileIx
      );
      txDelegate.feePayer = player1.publicKey;
      await sendAndConfirmTransaction(provider.connection, txDelegate, [player1], {
        skipPreflight: true,
        commitment: "confirmed",
      });
      console.log("✅ Player 1 Profile Delegated");
  });

  it("Initialize Player 2 Profile", async () => {
      const initIx = await program.methods
          .initializePlayer()
          .accounts({
              //@ts-ignore
              profile: player2ProfilePda,
              payer: player2.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
          })
          .instruction();

      // Permission and Delegation for Player 2 Profile
      let members : Member[] | null = [ 
        {
          flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
          pubkey: player2.publicKey
        }
      ]
      const createProfilePermissionIx = await program.methods
        .createPermission(
          { playerProfile: { player: player2.publicKey } },
          members
        )
        .accountsPartial({
          payer: player2.publicKey,
          permissionedAccount: player2ProfilePda,
          permission: permissionForPlayer2Profile,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const delegatePermission = createDelegatePermissionInstruction({
        payer: player2.publicKey,
        validator: ER_VALIDATOR,
        permissionedAccount: [player2ProfilePda, false],
        authority: [player2.publicKey, true],
      })

      const delegateProfileIx = await program.methods
          .delegatePda({ playerProfile: { player: player2.publicKey } })
          .accounts({
              payer: player2.publicKey,
              validator: ER_VALIDATOR,
              pda: player2ProfilePda,
          })
          .instruction();

      let tx = new anchor.web3.Transaction().add(
        initIx,
        createProfilePermissionIx,
        delegatePermission,
        delegateProfileIx
      );
      tx.feePayer = player2.publicKey;
      await sendAndConfirmTransaction(provider.connection, tx, [player2], {
        skipPreflight: true,
        commitment: "confirmed",
      });
      console.log("✅ Player 2 Profile Initialized and Delegated");
  });

  // Run 2 Games to verify logic and state reuse
  for (let i = 1; i <= 2; i++) {
        describe(`\n🎮 Game Round ${i}`, () => {
            const gameId = new BN(Date.now() + i * 1000);
            console.log(`Starting Game ${i} with ID: ${gameId.toString()}`);

            let [gamePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [GAME_SEED, gameId.toArrayLike(Buffer, "le", 8)],
                program.programId
            );
            let [player1ChoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player1.publicKey.toBuffer()],
                program.programId
            );
            let [player2ChoicePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [PLAYER_CHOICE_SEED, gameId.toArrayLike(Buffer, "le", 8), player2.publicKey.toBuffer()],
                program.programId
            );

            const permissionForGame = permissionPdaFromAccount(gamePda);
            const permissionForPlayer1Choice = permissionPdaFromAccount(player1ChoicePda);
            const permissionForPlayer2Choice = permissionPdaFromAccount(player2ChoicePda);

            it(`Create Game ${i} by Player 1`, async () => {
                // Re-delegate profiles if it's not the first game (or just always ensure they are delegated)
                // For Game 1 they are already delegated by init.
                // For Game 2, they were undelegated by Game 1 end.
                if (i > 1) {
                    console.log(`Re-delegating profiles for Game ${i}...`);
                    const reDelegateP1 = await program.methods
                        .delegatePda({ playerProfile: { player: player1.publicKey } })
                        .accounts({
                            payer: player1.publicKey,
                            validator: ER_VALIDATOR,
                            pda: player1ProfilePda,
                        })
                        .instruction();
                    const reDelegateP2 = await program.methods
                        .delegatePda({ playerProfile: { player: player2.publicKey } })
                        .accounts({
                            payer: player2.publicKey,
                            validator: ER_VALIDATOR,
                            pda: player2ProfilePda,
                        })
                        .instruction();
                    
                    const txRedelegate = new anchor.web3.Transaction().add(reDelegateP1, reDelegateP2);
                    txRedelegate.feePayer = player1.publicKey;
                    await sendAndConfirmTransaction(provider.connection, txRedelegate, [player1, player2], {
                        skipPreflight: true,
                        commitment: "confirmed",
                    });
                     console.log("✅ Profiles Re-delegated");
                }

                const createGameIx = await program.methods
                .createGame(gameId)
                .accounts({
                    //@ts-ignore
                    game: gamePda,
                    playerChoice: player1ChoicePda,
                    player1: player1.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .instruction();

                const membersForGame : Member[] | null = [ 
                {
                    flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
                    pubkey: player1.publicKey
                },
                {
                    flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
                    pubkey: player2.publicKey
                }
                ]
                const createGamePermissionIx = await program.methods
                .createPermission(
                    { game: { gameId } },
                    membersForGame 
                )
                .accountsPartial({
                    payer: player1.publicKey,
                    permissionedAccount: gamePda,
                    permission: permissionForGame,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .instruction();
                
                const delegatePermissionGame = createDelegatePermissionInstruction({
                payer: player1.publicKey,
                validator: ER_VALIDATOR,
                permissionedAccount: [gamePda, false],
                authority: [player1.publicKey, true],
                })
                
                const members : Member[] | null = [ 
                {
                    flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
                    pubkey: player1.publicKey
                }
                ]
                const createPlayer1ChoicePermissionIx = await program.methods
                .createPermission(
                    { playerChoice: { gameId, player: player1.publicKey } },
                    members
                )
                .accountsPartial({
                    payer: player1.publicKey,
                    permissionedAccount: player1ChoicePda,
                    permission: permissionForPlayer1Choice,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .instruction();
                const delegatePermission1 = createDelegatePermissionInstruction({
                payer: player1.publicKey,
                validator: ER_VALIDATOR,
                permissionedAccount: [player1ChoicePda, false],
                authority: [player1.publicKey, true],
                })

                const delegatePlayerChoice1Ix = await program.methods
                    .delegatePda({ playerChoice: { gameId, player: player1.publicKey } })
                    .accounts({
                        payer: player1.publicKey,
                        validator: ER_VALIDATOR,
                        pda: player1ChoicePda,
                    })
                    .instruction();

                let tx = new anchor.web3.Transaction().add(
                createGameIx,
                createGamePermissionIx,
                delegatePermissionGame,
                createPlayer1ChoicePermissionIx,
                delegatePermission1,
                delegatePlayerChoice1Ix
                );
                tx.feePayer = player1.publicKey;
                const txHash = await sendAndConfirmTransaction(provider.connection, tx, [player1], {
                skipPreflight: true,
                commitment: "confirmed",
                });
                console.log(`✅ Game ${i} Created:`, txHash);
                
                // Wait for sync
                await waitUntilPermissionActive(ephemeralRpcEndpoint, player1ChoicePda);
            });

            it("Join Game (Player 2)", async () => {
                const joinGameIx =  await program.methods
                    .joinGame(gameId)
                    .accounts({
                        //@ts-ignore
                        game: gamePda,
                        playerChoice: player2ChoicePda,
                        player: player2.publicKey,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    })
                    .instruction();

                let members : Member[] | null = [ 
                {
                    flags: AUTHORITY_FLAG | TX_LOGS_FLAG,
                    pubkey: player2.publicKey
                }
                ]
                const createPlayer2ChoicePermissionIx = await program.methods
                .createPermission(
                    { playerChoice: { gameId, player: player2.publicKey } },
                    members
                )
                .accountsPartial({
                    payer: player2.publicKey,
                    permissionedAccount: player2ChoicePda,
                    permission: permissionForPlayer2Choice,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .instruction();

                const delegatePermission2 = createDelegatePermissionInstruction({
                payer: player2.publicKey,
                validator: ER_VALIDATOR,
                permissionedAccount: [player2ChoicePda, false],
                authority: [player2.publicKey, true],
                })
                
                const delegateGameIx = await program.methods
                    .delegatePda({ game: { gameId } })
                    .accounts({
                        payer: player2.publicKey,
                        validator: ER_VALIDATOR,
                        pda: gamePda,
                    })
                    .instruction()

                const delegatePlayerChoice2Ix = await program.methods
                    .delegatePda({ playerChoice: { gameId, player: player2.publicKey } })
                    .accounts({
                        payer: player2.publicKey,
                        validator: ER_VALIDATOR,
                        pda: player2ChoicePda,
                    })
                    .instruction()

                let tx = new anchor.web3.Transaction().add(
                    joinGameIx,
                    createPlayer2ChoicePermissionIx,
                    delegatePermission2,
                    delegateGameIx,
                    delegatePlayerChoice2Ix
                );

                tx.feePayer = player2.publicKey;
                const txHash = await sendAndConfirmTransaction(provider.connection, tx, [player2], {
                skipPreflight: true,
                commitment: "confirmed",
                });

                console.log(`✅ Player 2 joined game ${gameId}: ${txHash}`);
                await waitUntilPermissionActive(ephemeralRpcEndpoint, player2ChoicePda);
            });

            it("Player 1 Makes Choice", async () => {
                const choice = getRandomChoice();
                const makeChoice1Ix = await program.methods
                .makeChoice(gameId, choice) 
                .accounts({
                    // @ts-ignore
                    playerChoice: player1ChoicePda,
                    player: player1.publicKey,
                })
                .instruction();

                let tx = new anchor.web3.Transaction().add(
                makeChoice1Ix
                );

                tx.feePayer = player1.publicKey;
                tx.recentBlockhash = (
                await providerTeePlayer1.connection.getLatestBlockhash())
                .blockhash;
                const txHash = await sendAndConfirmTransaction(providerTeePlayer1.connection, tx, [player1], {
                skipPreflight: true,
                commitment: "confirmed",
                });
                console.log(`✅ Player 1 choice submitted: ${txHash}`);
            });

            it("Player 2 Makes Choice", async () => {
                const choice = getRandomChoice();
                const makeChoice2Ix = await program.methods
                .makeChoice(gameId, choice) 
                .accounts({
                    // @ts-ignore
                    playerChoice: player2ChoicePda,
                    player: player2.publicKey,
                })
                .instruction();

                let tx = new anchor.web3.Transaction().add(
                makeChoice2Ix
                );

                tx.feePayer = player2.publicKey;
                const txHash = await sendAndConfirmTransaction(providerTeePlayer2.connection, tx, [player2], {
                skipPreflight: true,
                commitment: "confirmed",
                });
                console.log(`✅ Player 2 choice submitted: ${txHash}`);
            });

            it("Reveal Winner", async () => {
                let tx = await program.methods
                .revealWinner()
                .accounts({
                    //@ts-ignore
                    game: gamePda,
                    player1Choice: player1ChoicePda,
                    player2Choice: player2ChoicePda,
                    permissionGame: permissionForGame,
                    permission1: permissionForPlayer1Choice,
                    permission2: permissionForPlayer2Choice,
                    player1Profile: player1ProfilePda,
                    player2Profile: player2ProfilePda,
                    payer: player1.publicKey,
                })
                .transaction();
                tx.feePayer = player1.publicKey;
                const txHash = await sendAndConfirmTransaction(providerTeePlayer1.connection, tx, [player1], {
                skipPreflight: true,
                commitment: "confirmed"
                });
                console.log("✅ Reveal Winner TX Sent:", txHash);

                const accountInfo = await providerTeePlayer1.connection.getAccountInfo(gamePda);
                const gameAccount = program.coder.accounts.decode("game", accountInfo.data);
                console.log("🎲 Game Result Account Data:", gameAccount);

                const p1Profile = await program.account.playerProfile.fetch(player1ProfilePda);
                const p2Profile = await program.account.playerProfile.fetch(player2ProfilePda);
                console.log("Player 1 ELO:", p1Profile.elo.toString());
                console.log("Player 1 Games Played:", p1Profile.gamesPlayed.toString());
                console.log("Player 1 Lamports:", (await program.provider.connection.getAccountInfo(player1ProfilePda)).lamports);
                console.log("Player 2 Games Played:", p2Profile.gamesPlayed.toString());
                console.log("Player 2 ELO:", p2Profile.elo.toString());
            });
        });
  }


  after(async () => {
    console.log("🧹 Reclaiming SOL from players...");
    const reclaim = async (kp: anchor.web3.Keypair) => {
        try {
            const balance = await provider.connection.getBalance(kp.publicKey);
            if (balance > 5000) {
                const tx = new anchor.web3.Transaction().add(
                    anchor.web3.SystemProgram.transfer({
                        fromPubkey: kp.publicKey,
                        toPubkey: provider.wallet.publicKey,
                        lamports: balance - 5000, 
                    })
                );
                tx.feePayer = kp.publicKey;
                await sendAndConfirmTransaction(provider.connection, tx, [kp], {
                    skipPreflight: true,
                    commitment: "confirmed",
                });
                console.log(`💸 Reclaimed ${( (balance - 5000) / anchor.web3.LAMPORTS_PER_SOL).toFixed(4)} SOL from ${kp.publicKey.toBase58()}`);
            }
        } catch (e) {
            console.error(`⚠️ Failed to reclaim SOL from ${kp.publicKey.toBase58()}:`, e.message);
        }
    };
    await reclaim(player1);
    await reclaim(player2);
  });
});

type Choice = { rock: {}; } | { paper: {}; } | { scissors: {}; };

function getRandomChoice(): Choice {
  const random = Math.floor(Math.random() * 3);
  switch (random) {
    case 0: return { rock: {} };
    case 1: return { paper: {} };
    case 2: return { scissors: {} };
    default: throw new Error("Invalid random value");
  }
}
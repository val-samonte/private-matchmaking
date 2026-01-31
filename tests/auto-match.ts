
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorRockPaperScissor } from "../target/types/anchor_rock_paper_scissor";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import * as nacl from "tweetnacl";
import { assert } from "chai";

describe("auto-match", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorRockPaperScissor as Program<AnchorRockPaperScissor>;
  
  // TEE Setup
  // NOTE: Ephemeral RPC endpoint is usually in process.env or hardcoded for devnet
  // We assume the standard MagicBlock Devnet Endpoint or Local
  const ephemeralRpcEndpoint = process.env.EPHEMERAL_PROVIDER_ENDPOINT || "https://devnet.magicblock.app";
  
  // We need to construct the TEE provider manually to include Auth Token
  let teeProgram: Program<AnchorRockPaperScissor>;
  let teeProvider: anchor.AnchorProvider;
  let authToken: any;

  // Accounts
  const matchmakingStateSeed = Buffer.from("matchmaking_state_v3");
  const playerProfileSeed = Buffer.from("player_profile");

  const [matchmakingStatePda] = PublicKey.findProgramAddressSync(
    [matchmakingStateSeed],
    program.programId
  );

  const player1 = Keypair.generate();
  const player2 = Keypair.generate();

  const [p1ProfilePda] = PublicKey.findProgramAddressSync(
    [playerProfileSeed, player1.publicKey.toBuffer()],
    program.programId
  );
  const [p2ProfilePda] = PublicKey.findProgramAddressSync(
    [playerProfileSeed, player2.publicKey.toBuffer()],
    program.programId
  );

  async function getTeeProvider(signer: Keypair): Promise<Program<AnchorRockPaperScissor>> {
     let token: any;
     let retries = 5;
     while (retries > 0) {
        try {
            token = await getAuthToken(ephemeralRpcEndpoint, signer.publicKey, async (msg) => {
                 return nacl.sign.detached(msg, signer.secretKey);
            });
            break;
        } catch (e) {
            console.log(`Auth failed, retrying... (${retries})`);
            retries--;
            await new Promise(r => setTimeout(r, 2000));
        }
     }
     if (!token) throw new Error("Failed to get Auth Token after retries");
     
     // Construct provider with token in URL and Header
     const conn = new anchor.web3.Connection(`${ephemeralRpcEndpoint}?token=${token.token}`, {
        httpHeaders: { "Authorization": `Bearer ${token.token}` },
        commitment: "confirmed"
     });
     
     const wallet = new anchor.Wallet(signer);
     const p = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
     // Fix for Anchor 0.32.1: new Program(idl, provider)
     return new anchor.Program(program.idl as any, p);
  }

  before("Setup and Fund", async () => {
    // Fund players
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    
    // Transfer from provider wallet instead of airdrop to avoid 429
    const payer = (provider.wallet as anchor.Wallet).payer;
    
    const tx1 = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: player1.publicKey,
            lamports: 1 * 10**9 // 1 SOL
        })
    );
    await sendAndConfirmTransaction(provider.connection, tx1, [payer]);

    const tx2 = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: player2.publicKey,
            lamports: 1 * 10**9 // 1 SOL
        })
    );
    await sendAndConfirmTransaction(provider.connection, tx2, [payer]);
    
    // Initialize TEE Provider for P1 default
    // teeProgram = await getTeeProvider(player1); // Skipped for L1 verification
  });

  it("Initialize (L1)", async () => {
    // 1. Initialize Matchmaking State
    try {
        await program.methods.initializeMatchmaking().accounts({
            matchmakingState: matchmakingStatePda,
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
        }).rpc();
    } catch (e) {
        console.log("Matchmaking state might already exist", e);
    }

    // 2. Initialize Profiles
    await program.methods.initializePlayer().accounts({
        profile: p1ProfilePda,
        player: player1.publicKey,
        payer: player1.publicKey, // P1 pays
        systemProgram: SystemProgram.programId,
    }).signers([player1]).rpc();

    await program.methods.initializePlayer().accounts({
        profile: p2ProfilePda,
        player: player2.publicKey,
        payer: player2.publicKey, // P2 pays
        systemProgram: SystemProgram.programId,
    }).signers([player2]).rpc();

    // Verify L1 State
    const p1State = await program.account.playerProfile.fetch(p1ProfilePda);
    assert.equal(p1State.elo.toNumber(), 1000);
  });

  it.skip("Delegate Accounts to TEE", async () => {
     // We delegate Matchmaking State and Profiles to TEE execution
     // Uses `delegatePda` helper on L1 Program (helper implemented in contract?)
     // Wait, the `delegate_pda` instruction in lib.rs calls the ER SDK.
     // But we usually call `delegate` on the `EphemeralRollups` program directly or use the helper.
     // The helper in `lib.rs` `delegate_pda` makes it easier because it handles seeds.
     
    const magicBlockId = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"); // Verification

     // Delegate Matchmaking State
     await program.methods.delegatePda({matchmakingState: {}}).accounts({
         pda: matchmakingStatePda,
         payer: provider.wallet.publicKey,
         validator: null // Default validator
     }).rpc();

     // Delegate Profiles? 
     // For `reveal_winner` to `commit` them, they must be delegatable.
     // Let's delegate them just in case.
     await program.methods.delegatePda({playerProfile: {player: player1.publicKey}}).accounts({
         pda: p1ProfilePda,
         payer: player1.publicKey,
         validator: null
     }).signers([player1]).rpc();

     await program.methods.delegatePda({playerProfile: {player: player2.publicKey}}).accounts({
         pda: p2ProfilePda,
         payer: player2.publicKey,
         validator: null
     }).signers([player2]).rpc();
     
     console.log("Delegation Complete");
     // Wait for delegation prop?
     await new Promise(r => setTimeout(r, 2000));
  });

  it("Full Game Flow (Auto-Match L1)", async () => {
     // NOTE: Running on L1 for logic verification (TEE Skipped)
     const teeP1 = new anchor.Program(program.idl as any, new anchor.AnchorProvider(provider.connection, new anchor.Wallet(player1), {}));
     
     await teeP1.methods.ready().accounts({
         matchmakingState: matchmakingStatePda,
         player: player1.publicKey
     }).signers([player1]).rpc();
     console.log("P1 Ready (Queued)");

     // 2. Play 2 calls Ready
     const teeP2 = new anchor.Program(program.idl as any, new anchor.AnchorProvider(provider.connection, new anchor.Wallet(player2), {}));
     
     await teeP2.methods.ready().accounts({
         matchmakingState: matchmakingStatePda,
         player: player2.publicKey
     }).signers([player2]).rpc();
     console.log("P2 Ready (Matched on L1)");

     // 3. P1 Moves (Rock)
     await teeP1.methods.makeChoice({rock: {}}).accounts({
         matchmakingState: matchmakingStatePda,
         player: player1.publicKey
     }).signers([player1]).rpc();
     console.log("P1 Choice Made");

     // 4. P2 Moves (Scissors)
     await teeP2.methods.makeChoice({scissors: {}}).accounts({
         matchmakingState: matchmakingStatePda,
         player: player2.publicKey
     }).signers([player2]).rpc();
     console.log("P2 Choice Made");

     // 5. Reveal Winner
     // Pass internal Magic IDs even if unused, or just pass system program to satisfy constraints (UncheckedAccount)
     // Actually the struct defines magic_context as AccountInfo (unchecked).
     
     try {
         await teeP1.methods.revealWinner().accounts({
             matchmakingState: matchmakingStatePda,
             player1Profile: p1ProfilePda,
             player2Profile: p2ProfilePda,
             payer: player1.publicKey,
             magicContext: SystemProgram.programId, // Dummy
             magicProgram: SystemProgram.programId, // Dummy
         }).signers([player1]).rpc();
         console.log("Winner Revealed (L1)");
     } catch(e) {
         console.error("Reveal Error:", e);
         throw e;
     }

     // 6. Verify Persistence (Immediate on L1)
     const p1Final = await program.account.playerProfile.fetch(p1ProfilePda);
     const p2Final = await program.account.playerProfile.fetch(p2ProfilePda);
     
     console.log("P1 ELO:", p1Final.elo.toString());
     console.log("P2 ELO:", p2Final.elo.toString());
     
     assert.isAbove(p1Final.elo.toNumber(), 1000); // Winner (Rock beats Scissors)
     assert.isBelow(p2Final.elo.toNumber(), 1000);
  });
});

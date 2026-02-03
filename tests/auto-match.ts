
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorRockPaperScissor } from "../target/types/anchor_rock_paper_scissor";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAuthToken, createDelegatePermissionInstruction, permissionPdaFromAccount, AUTHORITY_FLAG, TX_LOGS_FLAG, waitUntilPermissionActive, getPermissionStatus, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, DEFAULT_PRIVATE_VALIDATOR } from "@magicblock-labs/ephemeral-rollups-sdk";
import { execSync } from "child_process";
import * as nacl from "tweetnacl";
import { assert } from "chai";

// Manual implementation of getAuthToken to debug "No challenge received"
async function getAuthTokenManual(rpcUrl: string, publicKey: PublicKey, signMessage: (msg: Uint8Array) => Promise<Uint8Array>): Promise<{ token: string, expiresAt: number }> {
    const bs58 = require("bs58");
    const fetch = global.fetch; // Ensure we use fetch (node 18+)

    // Normalize URL
    const baseUrl = rpcUrl.endsWith("/") ? rpcUrl.slice(0, -1) : rpcUrl;
    const challengeUrl = `${baseUrl}/auth/challenge?pubkey=${publicKey.toString()}`;
    
    console.log("Requesting Challenge from:", challengeUrl);
    console.log("Requesting Challenge from:", challengeUrl);
    // Use curl fallback if fetch is crashing
    let json: any;
    try {
        const curlCmd = `curl -s --max-time 10 "${challengeUrl}"`;
        const output = execSync(curlCmd).toString();
        json = JSON.parse(output);
    } catch (e) {
        throw new Error(`Curl challenge failed: ${e}`);
    }
    console.log("Challenge Response:", JSON.stringify(json));
    
    const { challenge, error } = json;
    
    if (typeof error === "string" && error.length > 0) {
        throw new Error(`Failed to get challenge: ${error}`);
    }
    if (typeof challenge !== "string" || challenge.length === 0) {
        console.error("Invalid Challenge Response:", json);
        throw new Error("No challenge received");
    }

    const signature = await signMessage(new Uint8Array(Buffer.from(challenge, "utf-8")));
    const signatureString = bs58.encode(signature);
    
    const loginUrl = `${baseUrl}/auth/login`;
    const authResponse = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            pubkey: publicKey.toString(),
            challenge,
            signature: signatureString,
        }),
    });

    if (!authResponse.ok) {
         const text = await authResponse.text();
         throw new Error(`Login failed: ${authResponse.status} ${authResponse.statusText}. Body: ${text}`);
    }

    const authJson = await authResponse.json() as { token: string; expiresAt?: number };
    if (typeof authJson.token !== "string" || authJson.token.length === 0) {
        throw new Error("No token received");
    }
    
    // Default expiration if not provided (30 days)
    const expiresAt = authJson.expiresAt ?? Date.now() + (1000 * 60 * 60 * 24 * 30);
    return { token: authJson.token, expiresAt };
}

// Helper to robustly wait for permission
async function robustWaitUntilPermissionActive(
  connection: Connection,
  pda: PublicKey,
  timeoutMs: number = 90000 
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
        // Note: SDK uses rpcEndpoint string, not Connection object usually?
        // Checking waitUntilPermissionActive signature: (rpcUrl: string, pubkey: PublicKey)
        await waitUntilPermissionActive(connection.rpcEndpoint, pda);
        return;
    } catch (e: any) {
        if (e.message?.includes("Not Found") || e.message?.includes("Method Not Allowed") || e.message?.includes("404") || e.message?.includes("405")) {
             console.log(`Waiting for permission indexing (ignoring ${e.message})...`);
             await new Promise(r => setTimeout(r, 2000));
        } else {
            console.error("Unknown permission error:", e);
             // retry anyway
             await new Promise(r => setTimeout(r, 2000));
        }
    }
  }
  throw new Error(`Timeout waiting for permission active on ${pda.toBase58()}`);
}

describe("auto-match", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorRockPaperScissor as Program<AnchorRockPaperScissor>;
  
  // TEE Setup
  const MAGIC_CONTEXT_DEVNET = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");
  console.log("Using Validator ID:", MAGIC_CONTEXT_DEVNET.toString());
  const ephemeralRpcEndpoint = "https://tee.magicblock.app/";
  
  // We need to construct the TEE provider manually to include Auth Token
  let teeProgram: Program<AnchorRockPaperScissor>;
  let teeProvider: anchor.AnchorProvider;
  let authToken: any;

  // Accounts
  const matchmakingStateSeed = Buffer.from("matchmaking_state_v31");
  const playerProfileSeed = Buffer.from("player_profile_v31");

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
     console.log(`Getting Auth Token for ${ephemeralRpcEndpoint}...`);
     let retries = 5;
     while (retries > 0) {
        try {
            // Use manual auth implementation
            token = await getAuthTokenManual(ephemeralRpcEndpoint, signer.publicKey, async (msg) => {
                    return nacl.sign.detached(msg, signer.secretKey);
            });
            break;
        } catch (e) {
            console.log(`Auth failed, retrying... (${retries})`);
            console.error("Auth Error Details:", e);
            retries--;
            await new Promise(r => setTimeout(r, 2000));
        }
     }
     if (!token) throw new Error("Failed to get Auth Token after retries");
     
     // Construct provider with token in URL and Header
     let conn: Connection;
     conn = new anchor.web3.Connection(`${ephemeralRpcEndpoint}?token=${token.token}`, {
        httpHeaders: { "Authorization": `Bearer ${token.token}` },
        commitment: "confirmed"
     });
     
     const wallet = new anchor.Wallet(signer);
     const p = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
     
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
            lamports: 0.1 * 10**9 // 1 SOL
        })
    );
    await sendAndConfirmTransaction(provider.connection, tx1, [payer]);

    const tx2 = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: player2.publicKey,
            lamports: 0.1 * 10**9 // 1 SOL
        })
    );
    await sendAndConfirmTransaction(provider.connection, tx2, [payer]);
    
    // Initialize TEE Provider for P1 default
    teeProgram = await getTeeProvider(player1);
  });

  after("Teardown and Reclaim SOL", async () => {
    // 1. Reclaim Matchmaking State (Undelegate)
    try {
        await program.methods.reclaimMatchmaking().accounts({
            payer: provider.wallet.publicKey,
            magicContext: MAGIC_CONTEXT_DEVNET,
        }).rpc();
        console.log("Reclaimed Matchmaking State ownership");
    } catch (e) {
        console.error("Failed to reclaim Matchmaking State ownership:", e);
    }

    // 2. Close Matchmaking State (Refunds Provider)
    try {
        await program.methods.closeMatchmaking().accounts({
            payer: provider.wallet.publicKey,
        }).rpc();
        console.log("Reclaimed Matchmaking State rent");
    } catch (e) {
        console.error("Failed to reclaim Matchmaking State rent:", e);
    }

    // 3. Reclaim P1 Profile
    await new Promise(r => setTimeout(r, 1000));
    try {
        await program.methods.reclaimPlayer().accounts({
            player: player1.publicKey,
            payer: player1.publicKey,
            magicContext: MAGIC_CONTEXT_DEVNET,
        }).signers([player1]).rpc();
        console.log("Reclaimed P1 Profile ownership");
    } catch (e) {
        console.error("Failed to reclaim P1 ownership:", e);
    }

    // 4. Close Player 1 Profile
    try {
        await program.methods.closePlayer().accounts({
            player: player1.publicKey,
            payer: player1.publicKey,
        }).signers([player1]).rpc();
        console.log("Reclaimed P1 Profile rent");
    } catch (e) {
        console.error("Failed to reclaim P1 Profile rent:", e);
    }

    // 5. Reclaim P2 Profile
    await new Promise(r => setTimeout(r, 2000));
    try {
        await program.methods.reclaimPlayer().accounts({
            player: player2.publicKey,
            payer: player2.publicKey,
            magicContext: MAGIC_CONTEXT_DEVNET,
        }).signers([player2]).rpc();
        console.log("Reclaimed P2 Profile ownership");
    } catch (e) {
        console.error("Failed to reclaim P2 ownership:", e);
    }

    // 6. Close Player 2 Profile
    try {
        await program.methods.closePlayer().accounts({
            player: player2.publicKey,
            payer: player2.publicKey,
        }).signers([player2]).rpc();
        console.log("Reclaimed P2 Profile rent");
    } catch (e) {
        console.error("Failed to reclaim P2 Profile rent:", e);
    }
  });

  it("Initialize (L1)", async () => {
    // 1. Initialize Matchmaking State
    try {
        await program.methods.initializeMatchmaking().accounts({
            payer: provider.wallet.publicKey,
        }).rpc();
    } catch (e) {
        console.log("Matchmaking state might already exist", e);
    }

    // 2. Initialize Profiles
    await program.methods.initializePlayer().accounts({
        player: player1.publicKey,
        payer: player1.publicKey, // P1 pays
    }).signers([player1]).rpc();

    await program.methods.initializePlayer().accounts({
        player: player2.publicKey,
        payer: player2.publicKey, // P2 pays
    }).signers([player2]).rpc();

    // Verify L1 State
    const p1State = await program.account.playerProfile.fetch(p1ProfilePda);
    assert.equal(p1State.elo.toNumber(), 1000);
  });

  it("Delegate Accounts to TEE", async () => {
     const ER_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");

     // --- Delegate Matchmaking State ---
     console.log("Delegating Matchmaking State...");
     const statePermissionPda = permissionPdaFromAccount(matchmakingStatePda);
     const ALL_FLAGS = AUTHORITY_FLAG | TX_LOGS_FLAG;
     const stateMembers: any[] = [
         { flags: ALL_FLAGS, pubkey: provider.wallet.publicKey },
         { flags: ALL_FLAGS, pubkey: player1.publicKey },
         { flags: ALL_FLAGS, pubkey: player2.publicKey }
     ];
     
     try {
         // Create Permission via CPI (Program Authority)
         const createStatePermissionIx = await program.methods.createPermission(
             { matchmakingState: {} },
             stateMembers
         ).accounts({
             permissionedAccount: matchmakingStatePda,
             permission: statePermissionPda,
             payer: provider.wallet.publicKey,
         }).instruction();
        
         const txCreate = new Transaction().add(createStatePermissionIx);
         await sendAndConfirmTransaction(provider.connection, txCreate, [(provider.wallet as anchor.Wallet).payer], {skipPreflight: true});
         console.log("Matchmaking State Permission Created");
     } catch(e) {
         console.log("State Permission Creation skipped (likely exists):", e);
     }

     try {
         // Delegate Permission via CPI (Program Authority)
         const delegateStatePdaIx = await program.methods.delegatePda({matchmakingState: {}}).accounts({
            payer: provider.wallet.publicKey,
            pda: matchmakingStatePda,
            validator: MAGIC_CONTEXT_DEVNET 
         }).instruction();

         const txDelegate = new Transaction().add(delegateStatePdaIx);
         await sendAndConfirmTransaction(provider.connection, txDelegate, [(provider.wallet as anchor.Wallet).payer]);
         console.log("Matchmaking State Delegated");
     } catch(e: any) {
         console.log("State Delegation failed:", e);
         if (e.logs) console.log("Logs:", e.logs);
         throw e; // Fail hard
     }

    // Verify Delegation and Wait
    console.log("Waiting for Matchmaking State Permission to be active...");
    await robustWaitUntilPermissionActive(provider.connection, matchmakingStatePda);
    console.log("Matchmaking State Permission Active!");


     // --- Delegate Player 1 Profile ---
     console.log("Delegating Player 1 Profile...");
     const p1PermissionPda = permissionPdaFromAccount(p1ProfilePda);
     const p1Members: any[] = [
        { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: player1.publicKey },
        { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: player2.publicKey }
     ];
     
     try {
         const createP1PermissionIx = await program.methods.createPermission(
             { playerProfile: { player: player1.publicKey } },
             p1Members
         ).accounts({
             permissionedAccount: p1ProfilePda,
             permission: p1PermissionPda,
             payer: provider.wallet.publicKey,
         }).instruction();
         
         const txCreateP1 = new Transaction().add(createP1PermissionIx);
         await sendAndConfirmTransaction(provider.connection, txCreateP1, [(provider.wallet as anchor.Wallet).payer], {skipPreflight: true});
         console.log("P1 Permission Created");
     } catch(e) {
        console.log("P1 Permission Creation skipped:", e);
     }

     try {
         const delegateP1PdaIx = await program.methods.delegatePda({ playerProfile: { player: player1.publicKey } })
         .accounts({
            payer: provider.wallet.publicKey,
            pda: p1ProfilePda,
            validator: MAGIC_CONTEXT_DEVNET
        }).instruction();

        const txP1 = new Transaction().add(delegateP1PdaIx);
        await sendAndConfirmTransaction(provider.connection, txP1, [(provider.wallet as anchor.Wallet).payer]);

        console.log("P1 Delegated");
     } catch(e: any) {
         console.log("P1 Delegation skipped:", e);
         if (e.logs) console.log("Logs:", e.logs);
         throw e; // Fail hard
     }


     // --- Delegate Player 2 Profile ---
     console.log("Delegating Player 2 Profile...");
     const p2PermissionPda = permissionPdaFromAccount(p2ProfilePda);
     const p2Members: any[] = [
        { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: player2.publicKey },
        { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: player1.publicKey }
     ];
     
     try {
        const createP2PermissionIx = await program.methods.createPermission(
            { playerProfile: { player: player2.publicKey } },
            p2Members
        ).accounts({
            permissionedAccount: p2ProfilePda,
            permission: p2PermissionPda,
            payer: provider.wallet.publicKey,
        }).instruction();

        const txCreateP2 = new Transaction().add(createP2PermissionIx);
        await sendAndConfirmTransaction(provider.connection, txCreateP2, [(provider.wallet as anchor.Wallet).payer], {skipPreflight: true});
        console.log("P2 Permission Created");
     } catch(e) {
        console.log("P2 Permission Creation skipped:", e);
     }

     try {
        const delegateP2PdaIx = await program.methods.delegatePda({ playerProfile: { player: player2.publicKey } })
        .accounts({
           payer: provider.wallet.publicKey,
           pda: p2ProfilePda,
           validator: MAGIC_CONTEXT_DEVNET
       }).instruction();

       const txP2 = new Transaction().add(delegateP2PdaIx);
       await sendAndConfirmTransaction(provider.connection, txP2, [(provider.wallet as anchor.Wallet).payer]);
       console.log("P2 Delegated");
    } catch(e: any) {
        console.log("P2 Delegation skipped:", e);
        if (e.logs) console.log("Logs:", e.logs);
    }
     
     console.log("Delegation Complete (With Relayer Authority)");
     
     // console.log("Waiting for permissions to be active...");
     // const isActive = await waitUntilPermissionActive(ephemeralRpcEndpoint, matchmakingStatePda);
     const isActive = true;
     if (isActive) {
        console.log("Permissions Active!");
     // Verify P1 Delegation
    console.log("Waiting for Player 1 Profile Permission...");
    await robustWaitUntilPermissionActive(provider.connection, p1ProfilePda);
    console.log("Player 1 Profile Permission Active!");

    // Verify P2 Delegation
    console.log("Waiting for Player 2 Profile Permission...");
    await robustWaitUntilPermissionActive(provider.connection, p2ProfilePda);
    console.log("Player 2 Profile Permission Active!");
    console.log("Player 2 Profile Permission Active!");
        // const status = await getPermissionStatus(ephemeralRpcEndpoint, matchmakingStatePda);
        // console.log("Permission Status:", JSON.stringify(status, null, 2));
     } else {
        throw new Error("Permissions for Matchmaking State failed to activate.");
     }
  });

  it("Smoke Test: Read-Only Connectivity check", async () => {
      console.log("Running Smoke Test (Read-Only)...");
      const teeP1 = await getTeeProvider(player1);
      console.log("TEE RPC:", teeP1.provider.connection.rpcEndpoint);
      
      const info = await teeP1.provider.connection.getAccountInfo(player1.publicKey);
      console.log("Player 1 Account Info on TEE:", info ? "Found" : "Not Found");
      
      const blockhash = await teeP1.provider.connection.getLatestBlockhash();
      console.log("TEE Blockhash:", blockhash.blockhash);
  });

  it("Full Game Flow (Relayer Pattern)", async () => {
     // 1. Player 1 calls Ready using TEE Provider
     let teeP1;
     let teeP2;
     // 1. Player 1 calls Ready using TEE Provider
     try {
         teeP1 = await getTeeProvider(player1);
         
         await teeP1.methods.ready().accounts({
             matchmakingState: matchmakingStatePda,
             player: player1.publicKey
         })
         .signers([player1]).rpc();
         console.log("P1 Ready (Queued)");

         // 2. Play 2 calls Ready
         teeP2 = await getTeeProvider(player2);
         
         await teeP2.methods.ready().accounts({
            matchmakingState: matchmakingStatePda,
            player: player2.publicKey,
         }).signers([player2]).rpc();
         console.log("P2 Ready (Matched, ideally)");
     } catch (e: any) {
         console.error("TEE Execution Error:", e);
         if (e.logs) console.log("Logs:", e.logs);
         throw e;
     }

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



     // 5. Reveal Winner (TEE ONLY - NO COMMIT)
      try {
          console.log("STEP 5 START: Reveal Winner");
          // Use player1 as payer (already funded on L1/TEE)
          await teeP1.methods.revealWinner().accounts({
              matchmakingState: matchmakingStatePda,
              player1Profile: p1ProfilePda,
              player2Profile: p2ProfilePda,
              payer: player1.publicKey,
          }).signers([player1]).rpc();
          console.log("STEP 5 END: Winner Revealed");
      } catch(e) {
          console.error("STEP 5 FAILED: Reveal Error", e);
          throw e;
      }

      // 6. Persist Results (L1 Commit by Relayer)
      try {
           console.log("STEP 6 START: Persist Results");
           console.log("Persisting Results to L1 via Relayer...");
          
           // Use TEE Provider for the Relayer/Authority to trigger commit on ER
           // Reverting to use the main provider's payer which is funded on L1
           const teeRelayer = await getTeeProvider((provider.wallet as anchor.Wallet).payer);

           console.log("Calling persistResults...");
           const persistIx = await teeRelayer.methods.persistResults().accounts({
              //@ts-ignore
              matchmakingState: matchmakingStatePda,
              player1Profile: p1ProfilePda,
              player2Profile: p2ProfilePda,
              payer: provider.wallet.publicKey,
          }).instruction();
 
          const txPersist = new Transaction().add(persistIx);
          txPersist.recentBlockhash = (await teeRelayer.provider.connection.getLatestBlockhash()).blockhash;
          txPersist.feePayer = provider.wallet.publicKey;
          
          const txSig = await sendAndConfirmTransaction(
              teeRelayer.provider.connection, 
              txPersist, 
              [(provider.wallet as anchor.Wallet).payer],
              {skipPreflight: true}
         );
          console.log("Results Persisted! Sig:", txSig);
 
      } catch(e) {
          console.error("Persist Error:", e);
          throw e;
      }

     // 7. Verify Persistence with Polling
     console.log("Verifying L1 State (Polling for update)...");
     let p1Final;
     let attempts = 0;
     while (attempts < 20) {
         p1Final = await program.account.playerProfile.fetch(p1ProfilePda);
         if (p1Final.elo.toNumber() > 1000) {
             console.log("L1 State Updated!");
             break;
         }
         console.log(`Attempt ${attempts + 1}: ELO still ${p1Final.elo.toNumber()}, waiting...`);
         await new Promise(r => setTimeout(r, 2000)); // Wait 2s
         attempts++;
     }
     
     const p2Final = await program.account.playerProfile.fetch(p2ProfilePda);
     
     console.log("P1 ELO:", p1Final.elo.toString());
     console.log("P2 ELO:", p2Final.elo.toString());
     
     assert.isAbove(p1Final.elo.toNumber(), 1000); 
     assert.isBelow(p2Final.elo.toNumber(), 1000);
  });
});

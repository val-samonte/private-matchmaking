import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PrivateMatchmaking } from "../target/types/private_matchmaking";
import { MatchmakingClient, deriveQueuePda } from "../sdk/src";
import { PublicKey } from "@solana/web3.js";
import { AnchorRockPaperScissor } from "../target/types/anchor_rock_paper_scissor";

// Configuration
const QUEUE_ID = "rps-prod-queue"; 
const ELO_OFFSET = 8; // Anchor accounts have 8 byte discriminator
const ELO_TYPE = 1;   // u64

async function main() {
    // 1. Configure the client
    const providerUrl = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
    const walletPath = process.env.ANCHOR_WALLET || `${require("os").homedir()}/.config/solana/id.json`;

    const connection = new anchor.web3.Connection(providerUrl, "confirmed");
    const wallet = new anchor.Wallet(
        anchor.web3.Keypair.fromSecretKey(
            Buffer.from(JSON.parse(require("fs").readFileSync(walletPath, "utf-8")))
        )
    );
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    console.log("🚀 Initializing Queue with Admin (from " + walletPath + "):", provider.wallet.publicKey.toBase58());

    // 2. Load Programs
    // Manual load to ensure it works without 'anchor test' environment
    const matchmakingIdl = require("../target/idl/private_matchmaking.json");
    const rpsIdl = require("../target/idl/anchor_rock_paper_scissor.json");

    const matchmakingProgram = new Program(matchmakingIdl, provider);
    const rpsProgram = new Program(rpsIdl, provider);
    
    // Check if Program ID needs override from IDL (it usually comes from IDL metadata)
    // matchmakingProgram.programId is derived from IDL address.

    const client = new MatchmakingClient(provider, matchmakingProgram.programId);

    // 3. Define Config
    const config = {
        eloOffset: ELO_OFFSET,
        eloType: ELO_TYPE,
        matchThreshold: 1000, 
        searchWindow: 60,
        reserved: new Array(64).fill(0),
        // The Tenant is the RPS Program (it owns the PlayerData accounts)
        tenantProgramId: rpsProgram.programId
    };

    // 4. Derive Queue Authority (PDA of RPS Program)
    const [queueAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("queue-authority")],
        rpsProgram.programId
    );
    
    // 5. Derive Queue PDA (Owned by queueAuthorityPda)
    const queuePda = deriveQueuePda(matchmakingProgram.programId, queueAuthorityPda, QUEUE_ID);
    
    // Derive Page 0 PDA
    // Assuming utility or manual derivation. SDK has `derivePagePda`. 
    // We can't easily import from SDK here if not built? We can replicate logic.
    const derivePagePdaLocal = (programId, queue, index) => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(index));
        return PublicKey.findProgramAddressSync(
            [Buffer.from("page"), queue.toBuffer(), buf],
            programId
        )[0];
    };
    const pagePda = derivePagePdaLocal(matchmakingProgram.programId, queuePda, 0);

    console.log("Queue Authority PDA:", queueAuthorityPda.toBase58());
    console.log("Expected Queue Address:", queuePda.toBase58());

    try {
        // @ts-ignore
        const queueAccount = await matchmakingProgram.account.queueHead.fetch(queuePda);
        console.log("✅ Queue already exists!");
        // console.log(`   Address:   ${queuePda.toBase58()}`);
        // console.log(`   Authority: ${queueAccount.authority.toBase58()}`);
        
    } catch (e) {
        console.log("Queue not found. Initializing via RPS Program (Production Mode)...");
        try {
            // 6. Initialize Queue via RPS Program (CPI)
            // capacity: 2, page_size: 10
            await rpsProgram.methods
                .initializeMsgQueue(QUEUE_ID, 2, 10)
                .accounts({
                    queue: queuePda,
                    page: pagePda,
                    authority: queueAuthorityPda,
                    payer: provider.wallet.publicKey,
                    tenantProgramId: rpsProgram.programId,
                    matchmakingProgram: matchmakingProgram.programId,
                    // systemProgram: SystemProgram.programId
                })
                .rpc();
            
            console.log("✅ Queue Initialized Successfully via CPI!");
            console.log(`   ID:        "${QUEUE_ID}"`);
            console.log(`   Address:   ${queuePda.toBase58()}`);
            console.log(`   Authority: ${queueAuthorityPda.toBase58()} (RPS PDA)`);
            console.log(`   Tenant:    ${rpsProgram.programId.toBase58()}`);
            
        } catch (initErr) {
            console.error("❌ Failed to initialize queue:", initErr);
        }
    }
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    }
);

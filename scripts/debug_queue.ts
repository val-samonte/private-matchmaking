import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { MatchmakingClient, deriveQueuePda, derivePagePda } from "../sdk/src";

const QUEUE_ID = "rps-prod-queue";

async function main() {
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

    console.log("Connect to:", providerUrl);
    
    // Load IDLs
    const matchmakingIdl = require("../target/idl/private_matchmaking.json");
    const rpsIdl = require("../target/idl/anchor_rock_paper_scissor.json");

    const matchmakingProgram = new Program(matchmakingIdl, provider);
    const rpsProgram = new Program(rpsIdl, provider);

    // Derive Queue Authority (RPS)
    const [queueAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("queue-authority")],
        rpsProgram.programId
    );

    // Derive Queue Address
    const queuePda = deriveQueuePda(matchmakingProgram.programId, queueAuthorityPda, QUEUE_ID);
    console.log(`Queue ID: ${QUEUE_ID}`);
    console.log(`Queue PDA: ${queuePda.toBase58()}`);
    console.log(`Queue Authority: ${queueAuthorityPda.toBase58()}`);

    try {
        // Fetch Queue Head
        // @ts-ignore
        const queueAccount = await matchmakingProgram.account.queueHead.fetch(queuePda);
        console.log("\n--- Queue Head ---");
        console.log("Write Page Index:", queueAccount.writePageIndex.toString());
        console.log("Read Page Index:", queueAccount.readPageIndex.toString());
        console.log("Capacity:", queueAccount.capacity);
        console.log("Page Size:", queueAccount.pageSize);

        // Fetch Page 0
        const page0Pda = derivePagePda(matchmakingProgram.programId, queuePda, 0);
        // @ts-ignore
        const page0 = await matchmakingProgram.account.queuePage.fetch(page0Pda);
        
        console.log("\n--- Page 0 Keys ---");
        console.log(Object.keys(page0));
        console.log("Raw Page:", page0);
        // Page items are in `items` array.
        // Assuming IDL defines it. It might be opaque bytes or struct.
        // Let's print raw items if possible.
        // The IDL for `QueuePage` should have `items`.
        if (page0.items) {
             console.log("Items:", JSON.stringify(page0.items, null, 2));
        }

    } catch (e) {
        console.error("Error fetching queue:", e);
    }
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    }
);

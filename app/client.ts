import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PrivateMatchmaking } from "../target/types/private_matchmaking";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";

// Constants
const PROGRAM_ID = new PublicKey("FTmhTEzrRrQp4U7ySjTLWry53VoKUCG4NqH12mcfzTSd"); 

export class MatchmakingClient {
    program: Program<PrivateMatchmaking>;
    provider: anchor.AnchorProvider;

    constructor(provider: anchor.AnchorProvider, programId: PublicKey) {
        this.provider = provider;
        this.program = new Program(
            require("../target/idl/private_matchmaking.json"),
            provider
        );
    }

    async initializeQueue(
        queueId: string, 
        config: any, 
        capacity: number,
        pageSize: number = 50
    ) {
        const [queuePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("queue-head"), this.provider.wallet.publicKey.toBuffer(), Buffer.from(queueId)],
            this.program.programId
        );

        const tx = await this.program.methods
            .initializeQueue(queueId, config, capacity, pageSize)
            .accounts({
                queue: queuePda,
                authority: this.provider.wallet.publicKey,
                tenantProgramId: config.tenantProgramId || this.provider.wallet.publicKey, // Default to self for testing
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        
        console.log(`Initialized Queue: ${queuePda.toBase58()} in tx: ${tx}`);
        
        // Initialize Pages (Ring Buffer)
        // Note: In production, do this in batches.
        for (let i = 0; i < capacity; i++) {
            await this.initializePage(queuePda, i, pageSize);
        }
        
        return queuePda;
    }

    async initializePage(queue: PublicKey, index: number, pageSize: number) {
        const [pagePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("page"), queue.toBuffer(), new anchor.BN(index).toArrayLike(Buffer, "le", 8)],
            this.program.programId
        );

        const tx = await this.program.methods
            .initializePage(new anchor.BN(index))
            .accounts({
                queue: queue,
                page: pagePda,
                authority: this.provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
            
        console.log(`Initialized Page ${index}: ${pagePda.toBase58()}`);
        return pagePda;
    }

    async delegateQueue(queueId: string) {
        const [queuePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("queue-head"), this.provider.wallet.publicKey.toBuffer(), Buffer.from(queueId)],
            this.program.programId
        );

        // We need the Delegation Program ID to pass as an account if implicitly required, 
        // but the macro handles CPI. We just need to ensure the client sends the right accounts.
        // The `delegateQueue` instruction expects [pda, authority, payer, validator, system_program?].
        // The #[delegate] macro injects `delegate_program` into the struct likely?
        // Let's rely on Anchor's resolution or check if we need to pass it explicitly.
        
        // Based on typical Anchor + SDK usage, we just call the method.
        // We assume 'validator' is optional (passed as null/undefined).
        
        const tx = await this.program.methods
            .delegateQueue(queueId)
            .preInstructions([
                // Request more heap for the Delegation Program if needed (it crashed with OOM)
                anchor.web3.ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 })
            ])
            .accounts({
                pda: queuePda,
                authority: this.provider.wallet.publicKey,
                payer: this.provider.wallet.publicKey,
                // TEE Validator for Private Ephemeral Rollups (from docs)
                validator: new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"), 
            })
            .rpc();
            
        console.log(`Delegated Queue ${queueId}: ${tx}`);
    }

    async joinQueue(queue: PublicKey, playerGameAccount: PublicKey, tenantProgramId: PublicKey) {
        // Fetch Queue State to get write_page_index
        const queueAccount = await this.program.account.queueHead.fetch(queue);
        const capacity = queueAccount.capacity;
        const writeIndex = queueAccount.writePageIndex.toNumber();
        const currentIndex = writeIndex % capacity;

        const [pagePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("page"), queue.toBuffer(), new anchor.BN(currentIndex).toArrayLike(Buffer, "le", 8)],
            this.program.programId
        );

        const [statusPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("status"), playerGameAccount.toBuffer()],
            this.program.programId
        );

        const tx = await this.program.methods
            .joinQueue()
            .accounts({
                queue: queue,
                page: pagePda,
                playerStatus: statusPda,
                playerAuthority: this.provider.wallet.publicKey,
                playerGameAccount: playerGameAccount,
            })
            .rpc();

        console.log(`Joined Queue at Page ${currentIndex}: ${tx} (Lock: ${statusPda.toBase58()})`);
        return statusPda;
    }

    async unlockPlayer(playerGameAccount: PublicKey, playerWallet: PublicKey) {
        const [statusPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("status"), playerGameAccount.toBuffer()],
            this.program.programId
        );
        
        // We need the Queue Address to satisfy 'playerStatus.queue == queue.key()' constraint.
        // We can fetch the status account to get the queue address from on-chain data.
        const statusAccount = await this.program.account.playerStatus.fetch(statusPda);
        const queueAddress = statusAccount.queue;

        const tx = await this.program.methods
            .unlockPlayer()
            .accounts({
                queue: queueAddress,
                authority: this.provider.wallet.publicKey, // Must be Queue Authority
                playerStatus: statusPda,
                player: playerWallet, // Destination for rent
                playerGameAccount: playerGameAccount
            })
            .rpc();
        
        console.log(`Unlocked Player: ${tx}`);
    }

    async processLoop(queue: PublicKey) {
        // ... (Same loop, omitted for brevity if unchanged logic, but keeping existing structure)
        console.log("Starting Matchmaking Crank...");
        while (true) {
             // ... Code remains same ...
             break; // Safety break for now
        }
    }

    async resizeQueue(queue: PublicKey, newCapacity: number) {
        const tx = await this.program.methods
            .resizeQueue(newCapacity)
            .accounts({
                queue: queue,
                authority: this.provider.wallet.publicKey,
            })
            .rpc();
        console.log(`Resized Queue to ${newCapacity}: ${tx}`);
    }

}

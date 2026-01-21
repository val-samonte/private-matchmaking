import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PrivateMatchmaking } from "../target/types/private_matchmaking";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";

// Constants
const PROGRAM_ID = new PublicKey("GvJ8sk3SAQfCHVAFdFyadFRsMjDojqWzeVteksAbsTJy"); 

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
                // queue: queuePda, // Auto-resolved
                // authority: this.provider.wallet.publicKey, // Auto-resolved/inferred
                tenantProgramId: config.tenantProgramId || this.provider.wallet.publicKey,
                // systemProgram: SystemProgram.programId, // Auto-resolved
            })
            .rpc();
        
        console.log(`Initialized Queue: ${queuePda.toBase58()} in tx: ${tx}`);
        
        // Initialize Pages (Ring Buffer)
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
                // page: pagePda, // Auto-resolved
                // authority: this.provider.wallet.publicKey, // Auto-resolved
                // systemProgram: SystemProgram.programId, // Auto-resolved
            })
            .rpc();
            
        console.log(`Initialized Page ${index}: ${pagePda.toBase58()}`);
        return pagePda;
    }

    async delegateQueue(queueId: string) {
        // ... (removed check)
        const tx = await this.program.methods
            .delegateQueue(queueId)
            // ... (removed preinstructions comment if generic)
            .preInstructions([
                anchor.web3.ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 })
            ])
            .accounts({
                // pda: queuePda, // Auto-resolved
                // authority: this.provider.wallet.publicKey,
                // payer: this.provider.wallet.publicKey,
                validator: new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"), 
            })
            .rpc();
            
        console.log(`Delegated Queue ${queueId}: ${tx}`);
    }

    async joinQueue(queue: PublicKey, playerGameAccount: PublicKey, tenantProgramId: PublicKey) {
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
                page: pagePda, // Not auto-resolved (dynamic index)
                // playerStatus: statusPda, // Auto-resolved
                // playerAuthority: this.provider.wallet.publicKey, // Auto-resolved
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
        
        const statusAccount = await this.program.account.playerStatus.fetch(statusPda);
        const queueAddress = statusAccount.queue;

        const tx = await this.program.methods
            .unlockPlayer()
            .accounts({
                queue: queueAddress,
                // authority: this.provider.wallet.publicKey, // Auto-resolved
                // playerStatus: statusPda, // Auto-resolved
                player: playerWallet, 
                playerGameAccount: playerGameAccount
            })
            .rpc();
        
        console.log(`Unlocked Player: ${tx}`);
    }

    // ... (skipped processLoop as user didn't flag it)

    async resizeQueue(queue: PublicKey, newCapacity: number) {
        const tx = await this.program.methods
            .resizeQueue(newCapacity)
            .accounts({
                queue: queue,
                // authority: this.provider.wallet.publicKey, // Auto-resolved
            })
            .rpc();
        console.log(`Resized Queue to ${newCapacity}: ${tx}`);
    }

}

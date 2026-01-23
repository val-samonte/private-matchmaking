import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { 
    PublicKey, 
    TransactionSignature,
    ComputeBudgetProgram,
    Keypair
} from "@solana/web3.js";
import { PrivateMatchmaking } from "./idl/private_matchmaking";
import { MatchmakingClientConfig, QueueHead, QueuePage, PlayerStatus } from "./types";
import { derivePagePda, derivePlayerStatusPda, deriveQueuePda } from "./matchmaking-utils";
import idl from "./idl/private_matchmaking.json";

// Default Validator for Devnet (MagicBlock)
const DEFAULT_VALIDATOR = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA";

export class MatchmakingClient {
    program: Program<PrivateMatchmaking>;
    provider: AnchorProvider;
    config: MatchmakingClientConfig;

    constructor(
        provider: AnchorProvider, 
        programId?: PublicKey,
        config: MatchmakingClientConfig = {}
    ) {
        this.provider = provider;
        this.config = config;
        
        // Use the IDL JSON to initialize the program
        // @ts-ignore
        this.program = new Program(idl, provider);
    }

    // --- Core Matchmaking Methods ---

    /**
     * Initialize a new matchmaking queue (Admin/Demo only).
     */
    async initializeQueue(
        queueId: string, 
        config: any, 
        capacity: number,
        pageSize: number = 50
    ): Promise<PublicKey> {
        const queuePda = deriveQueuePda(this.program.programId, this.provider.wallet.publicKey, queueId);
        
        // Ensure tenant ID is set
        const tenantProgramId = config.tenantProgramId || this.provider.wallet.publicKey;

        const tx = await this.program.methods
            .initializeQueue(queueId, config, capacity, pageSize)
            .accounts({
                // @ts-ignore
                tenantProgramId: tenantProgramId,
            })
            .rpc(this.config.confirmOptions);
        
        console.log(`Initialized Queue: ${queuePda.toBase58()} in tx: ${tx}`);
        
        // Initialize Pages (Ring Buffer)
        for (let i = 0; i < capacity; i++) {
            await this.initializePage(queuePda, i);
        }
        
        return queuePda;
    }

    /**
     * Initialize a specific page for the queue.
     */
    async initializePage(queue: PublicKey, index: number): Promise<PublicKey> {
        const pagePda = derivePagePda(this.program.programId, queue, index);
        
        const tx = await this.program.methods
            .initializePage(new anchor.BN(index))
            .accounts({
                queue: queue,
            })
            .rpc(this.config.confirmOptions);
            
        console.log(`Initialized Page ${index}: ${pagePda.toBase58()}`);
        return pagePda;
    }

    /**
     * Join the queue.
     */
    async joinQueue(
        queue: PublicKey, 
        playerGameAccount: PublicKey, 
        // tenantProgramId: PublicKey
    ): Promise<{ tx: TransactionSignature, statusPda: PublicKey }> {
        // Fetch queue to determine current WRITE index
        const queueAccount = await this.getQueue(queue);
        const capacity = queueAccount.capacity;
        const writeIndex = queueAccount.writePageIndex.toNumber();
        const currentIndex = writeIndex % capacity;

        const pagePda = derivePagePda(this.program.programId, queue, currentIndex);
        const statusPda = derivePlayerStatusPda(this.program.programId, playerGameAccount);

        const tx = await this.program.methods
            .joinQueue()
            .accounts({
                queue: queue,
                // @ts-ignore - anchor type resolution for dynamic PDAs can be tricky
                page: pagePda, 
                playerGameAccount: playerGameAccount,
            })
            .rpc(this.config.confirmOptions);

        console.log(`Joined Queue at Page ${currentIndex}: ${tx} (Lock: ${statusPda.toBase58()})`);
        return { tx, statusPda };
    }

    /**
     * Unlock a player manually (refund rent).
     */
    async unlockPlayer(
        playerGameAccount: PublicKey, 
        playerWallet: PublicKey
    ): Promise<TransactionSignature> {
        const statusPda = derivePlayerStatusPda(this.program.programId, playerGameAccount);
        const statusAccount = await this.getPlayerStatus(statusPda);
        const queueAddress = statusAccount.queue;

        const tx = await this.program.methods
            .unlockPlayer()
            .accounts({
                queue: queueAddress,
                player: playerWallet,
                playerGameAccount: playerGameAccount
            })
            .rpc(this.config.confirmOptions);
        
        console.log(`Unlocked Player: ${tx}`);
        return tx;
    }

    /**
     * Process a match (Crank).
     */
    async processMatch(
        queue: PublicKey,
        pageIndex: number
    ): Promise<TransactionSignature> {
        const pagePda = derivePagePda(this.program.programId, queue, pageIndex);
        
        const tx = await this.program.methods
            .processMatch(new anchor.BN(pageIndex))
            .accounts({
                queue: queue,
                // @ts-ignore
                page: pagePda
            })
            .rpc(this.config.confirmOptions);
            
        console.log(`Processed Match on Page ${pageIndex}: ${tx}`);
        return tx;
    }

    // --- State Fetchers ---

    async getQueue(queuePda: PublicKey): Promise<QueueHead> {
        return await this.program.account.queueHead.fetch(queuePda);
    }

    async getPage(pagePda: PublicKey): Promise<QueuePage> {
        return await this.program.account.queuePage.fetch(pagePda);
    }

    async getPlayerStatus(statusPda: PublicKey): Promise<PlayerStatus> {
        return await this.program.account.playerStatus.fetch(statusPda);
    }
    
    async getPlayerStatusForGameAccount(playerGameAccount: PublicKey): Promise<PlayerStatus> {
         const statusPda = derivePlayerStatusPda(this.program.programId, playerGameAccount);
         return await this.getPlayerStatus(statusPda);
    }
}

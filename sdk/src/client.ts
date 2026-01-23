import * as anchor from "@coral-xyz/anchor";
import { Program, Idl, AnchorProvider } from "@coral-xyz/anchor";
import { 
    PublicKey, 
    SystemProgram, 
    Keypair, 
    TransactionSignature,
    ComputeBudgetProgram
} from "@solana/web3.js";
import { PrivateMatchmaking } from "./idl/private_matchmaking";
import { MatchmakingClientConfig, QueueHead, QueuePage, PlayerStatus, JoinQueueResult } from "./types";
import { derivePagePda, derivePlayerStatusPda, deriveQueuePda } from "./utils";
import { EncryptionProvider } from "./encryption";

// Default Validator for Devnet (MagicBlock)
const DEFAULT_VALIDATOR = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA";

export class MatchmakingClient {
    program: Program<PrivateMatchmaking>;
    provider: AnchorProvider;
    config: MatchmakingClientConfig;
    encryption: EncryptionProvider;

    constructor(
        provider: AnchorProvider, 
        programId: PublicKey,
        config: MatchmakingClientConfig = {}
    ) {
        this.provider = provider;
        this.config = config;
        this.encryption = new EncryptionProvider();
        
        // Load the IDL (we assume it's bundled or we can require it if running in node)
        // For SDK purity, we should import the JSON.
        const idl = require("./idl/private_matchmaking.json");
        idl.address = programId.toBase58();
        this.program = new Program(idl, provider);
    }

    /**
     * Initialize a new matchmaking queue.
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
                // queue: queuePda,
                // authority: this.provider.wallet.publicKey,
                tenantProgramId: tenantProgramId,
                // systemProgram: SystemProgram.programId,
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
                // page: pagePda,
                // authority: this.provider.wallet.publicKey,
                // systemProgram: SystemProgram.programId,
            })
            .rpc(this.config.confirmOptions);
            
        console.log(`Initialized Page ${index}: ${pagePda.toBase58()}`);
        return pagePda;
    }

    /**
     * Delegate the queue to the Privacy Layer (Ephemeral Rollup).
     */
    async delegateQueue(queueId: string, validatorOverride?: PublicKey): Promise<TransactionSignature> {
        const validator = validatorOverride || new PublicKey(DEFAULT_VALIDATOR);
        const queuePda = deriveQueuePda(this.program.programId, this.provider.wallet.publicKey, queueId);

        const tx = await this.program.methods
            .delegateQueue(queueId)
            .preInstructions([
                ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 })
            ])
            .accounts({
                // pda: queuePda,
                // authority: this.provider.wallet.publicKey,
                // payer: this.provider.wallet.publicKey,
                validator: validator,
            })
            .rpc(this.config.confirmOptions);
            
        console.log(`Delegated Queue ${queueId}: ${tx}`);
        return tx;
    }

    /**
     * Join the queue.
     */
    async joinQueue(
        queue: PublicKey, 
        playerGameAccount: PublicKey, 
        tenantProgramId: PublicKey
    ): Promise<JoinQueueResult> {
        // Fetch queue to determine current WRITE index
        const queueAccount = await this.getQueue(queue);
        const capacity = queueAccount.capacity;
        const writeIndex = queueAccount.writePageIndex.toNumber();
        const currentIndex = writeIndex % capacity;

        const pagePda = derivePagePda(this.program.programId, queue, currentIndex);
        const statusPda = derivePlayerStatusPda(this.program.programId, playerGameAccount);

        // Encryption Handshake Integration
        let instructionData: Buffer | undefined;
        if (this.config.encrypted) {
            console.log("🔒 Encrypted Queue Join Init...");
            // TODO: Fetch Validator Key from on-chain Registry or Delegate Account
            // For now, using a mock dummy key for demonstration of the flow
            // In PROD: const validatorKey = await this.getValidatorKey(queue);
            const mockValidatorKey = await this.encryption.createMockValidatorKey(); // Valid P-256 Public Key
            
            // Perform Encryption
            // Real payload would vary (e.g. Rock/Paper/Scissor choice)
            const payload = Buffer.from("PLAYER_CHOICE_ROCK");
            const { encrypted, clientPublicKey } = await this.encryption.encryptPayload(payload, mockValidatorKey);
            console.log("🔒 Payload Encrypted. Client PubKey:", Buffer.from(clientPublicKey).toString('hex'));
            
            // In a real implementation, 'encrypted' and 'clientPublicKey' would be passed 
            // as arguments to the 'joinQueue' instruction modification.
            // Since the IDL isn't updated for arguments yet, we just log it.
        }

        const tx = await this.program.methods
            .joinQueue()
            .accounts({
                queue: queue,
                // page: pagePda,
                page: pagePda, 
                // playerStatus: statusPda,
                // playerAuthority: this.provider.wallet.publicKey,
                playerGameAccount: playerGameAccount,
                tenantProgram: tenantProgramId, // Added for Matchable Interface CPI
                // systemProgram: SystemProgram.programId,
            })
            .rpc(this.config.confirmOptions);

        console.log(`Joined Queue at Page ${currentIndex}: ${tx} (Lock: ${statusPda.toBase58()})`);
        
        // Future Logic: If SDK receives a return log/event indicating "Instant Match", parse it.
        // For now, default to "Queued".
        return { 
            status: "Queued", 
            tx, 
            statusPda 
        };
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
                // authority: this.provider.wallet.publicKey,
                // playerStatus: statusPda,
                player: playerWallet,
                playerGameAccount: playerGameAccount
            })
            .rpc(this.config.confirmOptions);
        
        console.log(`Unlocked Player: ${tx}`);
        return tx;
    }

    /**
     * Process matches on a specific page.
     * Usually called by the off-chain worker or manually for testing.
     */
    async processMatch(
        queue: PublicKey,
        pageIndex: number
    ): Promise<TransactionSignature> {
        const pagePda = derivePagePda(this.program.programId, queue, pageIndex);

        const tx = await this.program.methods
            .processMatch(new anchor.BN(pageIndex))
            .accounts({
                queueAccount: queue,
                // page: pagePda,
            })
            .rpc(this.config.confirmOptions);

        return tx;
    }
    
    /**
     * Resize the queue capacity.
     */
    async resizeQueue(queue: PublicKey, newCapacity: number): Promise<TransactionSignature> {
        const tx = await this.program.methods
            .resizeQueue(newCapacity)
            .accounts({
                queue: queue,
                // authority: this.provider.wallet.publicKey,
            })
            .rpc(this.config.confirmOptions);
        console.log(`Resized Queue to ${newCapacity}: ${tx}`);
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

    // --- Dev Helpers ---

    async createMockPlayer(
        playerAccount: Keypair, 
        elo: number
    ): Promise<TransactionSignature> {
        const tx = await this.program.methods
            .createMockPlayer(new anchor.BN(elo))
            .accounts({
                playerAccount: playerAccount.publicKey,
                authority: this.provider.wallet.publicKey,
                // systemProgram: SystemProgram.programId,
            })
            .signers([playerAccount])
            .rpc(this.config.confirmOptions);
        return tx;
    }

    /**
     * Close a queue page to reclaim rent.
     */
    async closePage(queue: PublicKey, index: number): Promise<TransactionSignature> {
        const pagePda = derivePagePda(this.program.programId, queue, index);
        const tx = await this.program.methods
            .closePage(new anchor.BN(index))
            .accounts({
                queue: queue,
                // page: pagePda, // Auto-resolved
                authority: this.provider.wallet.publicKey,
            })
            .rpc(this.config.confirmOptions);
        console.log(`Closed Page ${index}: ${pagePda.toBase58()}`);
        return tx;
    }

    /**
     * Close a queue head to reclaim rent.
     */
    async closeQueue(queueId: string): Promise<TransactionSignature> {
        const queuePda = deriveQueuePda(this.program.programId, this.provider.wallet.publicKey, queueId);
        const tx = await this.program.methods
            .closeQueue(queueId)
            .accounts({
                // queue: queuePda, // Auto-resolved
                authority: this.provider.wallet.publicKey,
            })
            .rpc(this.config.confirmOptions);
        console.log(`Closed Queue: ${queuePda.toBase58()}`);
        return tx;
    }
}

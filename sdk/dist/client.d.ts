import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, Keypair, TransactionSignature } from "@solana/web3.js";
import { PrivateMatchmaking } from "./idl/private_matchmaking";
import { MatchmakingClientConfig, QueueHead, QueuePage, PlayerStatus, JoinQueueResult } from "./types";
import { EncryptionProvider } from "./encryption";
export declare class MatchmakingClient {
    program: Program<PrivateMatchmaking>;
    provider: AnchorProvider;
    config: MatchmakingClientConfig;
    encryption: EncryptionProvider;
    constructor(provider: AnchorProvider, programId: PublicKey, config?: MatchmakingClientConfig);
    /**
     * Initialize a new matchmaking queue.
     */
    initializeQueue(queueId: string, config: any, capacity: number, pageSize?: number): Promise<PublicKey>;
    /**
     * Initialize a specific page for the queue.
     */
    initializePage(queue: PublicKey, index: number): Promise<PublicKey>;
    /**
     * Delegate the queue to the Privacy Layer (Ephemeral Rollup).
     */
    delegateQueue(queueId: string, validatorOverride?: PublicKey): Promise<TransactionSignature>;
    /**
     * Join the queue.
     */
    joinQueue(queue: PublicKey, playerGameAccount: PublicKey, tenantProgramId: PublicKey): Promise<JoinQueueResult>;
    /**
     * Unlock a player manually (refund rent).
     */
    unlockPlayer(playerGameAccount: PublicKey, playerWallet: PublicKey): Promise<TransactionSignature>;
    /**
     * Process matches on a specific page.
     * Usually called by the off-chain worker or manually for testing.
     */
    processMatch(queue: PublicKey, pageIndex: number): Promise<TransactionSignature>;
    /**
     * Resize the queue capacity.
     */
    resizeQueue(queue: PublicKey, newCapacity: number): Promise<TransactionSignature>;
    getQueue(queuePda: PublicKey): Promise<QueueHead>;
    getPage(pagePda: PublicKey): Promise<QueuePage>;
    getPlayerStatus(statusPda: PublicKey): Promise<PlayerStatus>;
    getPlayerStatusForGameAccount(playerGameAccount: PublicKey): Promise<PlayerStatus>;
    createMockPlayer(playerAccount: Keypair, elo: number): Promise<TransactionSignature>;
    /**
     * Close a queue page to reclaim rent.
     */
    closePage(queue: PublicKey, index: number): Promise<TransactionSignature>;
    /**
     * Close a queue head to reclaim rent.
     */
    closeQueue(queueId: string): Promise<TransactionSignature>;
}

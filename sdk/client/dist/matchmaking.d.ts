import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature, ConfirmOptions, Keypair } from "@solana/web3.js";
import { PrivateMatchmaking } from "./types";
export { PrivateMatchmaking };
export declare class MatchmakingClient {
    program: Program<PrivateMatchmaking>;
    provider: AnchorProvider;
    constructor(provider: AnchorProvider, programId?: PublicKey);
    /**
     * Derive the Queue PDA
     */
    getQueuePda(authority: PublicKey): PublicKey;
    /**
     * Derive the Tenant PDA
     */
    getTenantPda(authority: PublicKey): PublicKey;
    /**
     * Initialize a Tenant
     */
    initializeTenant(authority: PublicKey, tenantProgramId: PublicKey, eloWindow?: number, eloOffset?: number, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
    /**
     * Initialize a Queue
     */
    initializeQueue(authority: PublicKey, tenant: PublicKey, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
    /**
     * Delegate Queue to TEE
     */
    delegateQueue(authority: PublicKey, validator?: PublicKey, // Default Reference Validator
    confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
    /**
     * Join Queue (TEE Aware)
     */
    joinQueue(queue: PublicKey, tenant: PublicKey, playerData: PublicKey, confirmOptions?: ConfirmOptions): Promise<TransactionSignature>;
    /**
     * Process Match
     */
    processMatch(queue: PublicKey, tenant: PublicKey, confirmOptions?: ConfirmOptions): Promise<TransactionSignature>;
}

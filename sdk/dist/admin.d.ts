import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature, ConfirmOptions, Keypair } from "@solana/web3.js";
import { PrivateMatchmaking } from "./types";
export declare class MatchmakingAdmin {
    program: Program<PrivateMatchmaking>;
    provider: AnchorProvider;
    constructor(provider: AnchorProvider, programId?: PublicKey);
    getQueuePda(authority: PublicKey): PublicKey;
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
    delegateQueue(authority: PublicKey, validator?: PublicKey, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
    /**
     * Process Match (Admin/Maintenance)
     */
    processMatch(queue: PublicKey, tenant: PublicKey, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
}

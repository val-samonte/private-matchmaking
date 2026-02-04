import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature, ConfirmOptions, Keypair } from "@solana/web3.js";
import { Duel } from "./types";
export type EloDataType = 'u8' | 'u16' | 'u32' | 'u64';
export interface InitializeTenantOptions {
    authority?: PublicKey;
    eloWindow?: number;
    eloOffset?: number;
    eloDataType?: EloDataType;
}
export declare class MatchmakingAdmin {
    program: Program<Duel>;
    provider: AnchorProvider;
    constructor(provider: AnchorProvider, programId?: PublicKey);
    getQueuePda(authority: PublicKey): PublicKey;
    getTenantPda(authority: PublicKey): PublicKey;
    /**
     * Initialize a Tenant
     */
    initializeTenant(tenantProgramId: PublicKey, options?: InitializeTenantOptions, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
    /**
     * Initialize a Queue
     */
    initializeQueue(authority: PublicKey, tenant: PublicKey, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
    /**
     * Delegate Queue to TEE
     */
    delegateQueue(authority: PublicKey, validator?: PublicKey, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
}

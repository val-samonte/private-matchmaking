import * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import type { Duel } from "./types.js";
export type EloDataType = 'u8' | 'u16' | 'u32' | 'u64';
export interface InitializeTenantOptions {
    authority?: web3.PublicKey;
    eloWindow?: number;
    eloOffset?: number;
    eloDataType?: EloDataType;
    callbackProgramId?: web3.PublicKey | null;
    callbackDiscriminator?: number[] | null;
}
export declare class MatchmakingAdmin {
    program: anchor.Program<Duel>;
    provider: anchor.AnchorProvider;
    constructor(provider: anchor.AnchorProvider, programId: web3.PublicKey | string);
    getQueuePda(authority: web3.PublicKey): web3.PublicKey;
    getTenantPda(authority: web3.PublicKey): web3.PublicKey;
    getTicketPda(player: web3.PublicKey, tenant: web3.PublicKey): web3.PublicKey;
    /**
     * Fetch Queue account data
     */
    getQueue(queuePda: web3.PublicKey): Promise<any>;
    /**
     * Fetch Tenant account data
     */
    getTenant(tenantPda: web3.PublicKey): Promise<any>;
    /**
     * Initialize a Tenant (with optional callback config)
     */
    initializeTenant(tenantProgramId: web3.PublicKey, options?: InitializeTenantOptions, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Initialize a Queue
     */
    initializeQueue(authority: web3.PublicKey, tenant: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Delegate Queue to TEE
     */
    delegateQueue(authority: web3.PublicKey, validator?: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Flush pending matches - crank instruction to update opponent tickets
     * Can be called by any TEE-authenticated wallet (permissionless)
     */
    flushMatches(queue: web3.PublicKey, tenant: web3.PublicKey, ticketPdas: web3.PublicKey[], callbackProgram?: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Commit matched tickets back to L1 (runs in TEE)
     */
    commitTickets(tenant: web3.PublicKey, ticketPdas: web3.PublicKey[], confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
}

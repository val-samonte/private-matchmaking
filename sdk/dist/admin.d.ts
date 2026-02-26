import { type Address, type TransactionSigner, type Rpc, type SolanaRpcApi } from "@solana/kit";
export type EloDataType = "u8" | "u16" | "u32" | "u64";
export interface InitializeTenantOptions {
    authority?: Address;
    eloWindow?: bigint;
    eloOffset?: number;
    eloDataType?: EloDataType;
    callbackProgramId?: Address | null;
    callbackDiscriminator?: number[] | null;
}
export declare class MatchmakingAdmin {
    rpc: Rpc<SolanaRpcApi>;
    signer: TransactionSigner;
    programId: Address;
    constructor(rpc: Rpc<SolanaRpcApi>, signer: TransactionSigner, programId?: Address);
    getQueuePda(authority: Address): Promise<Address>;
    getTenantPda(authority: Address): Promise<Address>;
    getTicketPda(player: Address, tenant: Address): Promise<Address>;
    getQueue(queuePda: Address): Promise<import("@solana/accounts").Account<import("./generated/duel/index.js").Queue, string>>;
    initializeTenant(tenantProgramId: Address, options?: InitializeTenantOptions): Promise<string>;
    initializeQueue(_authority: Address, tenant: Address): Promise<string>;
    delegateQueue(authority: Address, validator?: Address): Promise<string>;
    flushMatches(queue: Address, tenant: Address, ticketPdas: Address[], callbackProgram?: Address): Promise<string>;
    commitTickets(tenant: Address, ticketPdas: Address[]): Promise<string>;
    /** Create a new MatchmakingAdmin pointing at a TEE RPC endpoint. */
    withRpc(teeUrl: string): MatchmakingAdmin;
}

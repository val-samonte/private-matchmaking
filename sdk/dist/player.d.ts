import { type Address, type TransactionSigner, type Rpc, type SolanaRpcApi } from "@solana/kit";
export declare class MatchmakingPlayer {
    rpc: Rpc<SolanaRpcApi>;
    signer: TransactionSigner;
    programId: Address;
    constructor(rpc: Rpc<SolanaRpcApi>, signer: TransactionSigner, programId?: Address);
    getTicketPda(player: Address, tenant: Address): Promise<Address>;
    getTicket(ticketPda: Address): Promise<import("@solana/accounts").MaybeAccount<import("./generated/duel/index.js").MatchTicket, string>>;
    createTicket(tenant: Address): Promise<string>;
    delegateTicket(player: Address, tenant: Address, validator?: Address): Promise<string>;
    joinQueue(queue: Address, tenant: Address, playerData: Address): Promise<string>;
    cancelTicket(tenant: Address): Promise<string>;
    closeTicket(tenant: Address): Promise<string>;
    /**
     * Poll L1 for ticket status.
     * Returns match info when status becomes Matched.
     */
    pollForMatch(ticketPda: Address, maxAttempts?: number, pollInterval?: number, signal?: AbortSignal): Promise<{
        opponent: Address;
        matchId: bigint;
    } | null>;
    /** Create a new MatchmakingPlayer pointing at a TEE RPC endpoint. */
    withRpc(teeUrl: string): MatchmakingPlayer;
}

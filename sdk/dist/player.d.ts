import * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import type { Duel } from "./types.js";
export declare class MatchmakingPlayer {
    program: anchor.Program<Duel>;
    provider: anchor.AnchorProvider;
    constructor(provider: anchor.AnchorProvider, programId: web3.PublicKey | string);
    /**
     * Derive MatchTicket PDA
     */
    getTicketPda(player: web3.PublicKey, tenant: web3.PublicKey): web3.PublicKey;
    /**
     * Fetch MatchTicket account data
     */
    getTicket(ticketPda: web3.PublicKey): Promise<any>;
    /**
     * Create MatchTicket PDA on L1
     */
    createTicket(tenant: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Delegate ticket into TEE (becomes invisible on L1)
     */
    delegateTicket(player: web3.PublicKey, tenant: web3.PublicKey, validator?: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Join Queue (TEE Aware) - now requires ticket
     */
    joinQueue(queue: web3.PublicKey, tenant: web3.PublicKey, playerData: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Cancel search, marks ticket as Cancelled (runs in TEE)
     */
    cancelTicket(tenant: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Close ticket and reclaim rent (L1, after match consumed or cancelled)
     */
    closeTicket(tenant: web3.PublicKey, confirmOptions?: web3.ConfirmOptions, signers?: web3.Keypair[]): Promise<web3.TransactionSignature>;
    /**
     * Wait for match by subscribing to ticket PDA changes on L1.
     * Returns match info when ticket status changes to Matched.
     */
    waitForMatch(ticketPda: web3.PublicKey, connection: web3.Connection, timeoutMs?: number): Promise<{
        opponent: web3.PublicKey;
        matchId: anchor.BN;
    } | null>;
    /**
     * Poll L1 for ticket status (fallback for environments without websocket)
     */
    pollForMatch(ticketPda: web3.PublicKey, connection: web3.Connection, maxAttempts?: number, pollInterval?: number, signal?: AbortSignal): Promise<{
        opponent: web3.PublicKey;
        matchId: anchor.BN;
    } | null>;
}

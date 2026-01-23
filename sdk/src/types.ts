import { IdlAccounts, Idl } from "@coral-xyz/anchor";
import { PrivateMatchmaking } from "./idl/private_matchmaking";
import { PublicKey } from "@solana/web3.js";

export { PrivateMatchmaking };

export type QueueHead = IdlAccounts<PrivateMatchmaking>["queueHead"];
export type QueuePage = IdlAccounts<PrivateMatchmaking>["queuePage"];
export type PlayerStatus = IdlAccounts<PrivateMatchmaking>["playerStatus"];

export interface MatchmakingClientConfig {
    /**
     * Optional: Override the ConfirmOptions for transactions/fetches.
     */
    confirmOptions?: import("@solana/web3.js").ConfirmOptions;
    
    /**
     * Optional: Provide a separate payer if different from provider wallet.
     * (Not fully implemented in v1, but good for future proofing)
     */
    payer?: import("@solana/web3.js").PublicKey;

    /**
     * Enable Client-Side Encryption for queue inputs using TEE Handshake.
     * Default: false
     */
   encrypted?: boolean;
}

export interface MatchEvent {
    queue: PublicKey;
    playerA: PublicKey;
    playerB: PublicKey;
    eloA: import("@coral-xyz/anchor").BN;
    eloB: import("@coral-xyz/anchor").BN;
    timestamp: import("@coral-xyz/anchor").BN;
}

export type JoinQueueResult = 
    | { status: "Queued"; tx: string; statusPda: PublicKey }
    | { status: "Matched"; tx: string; match: MatchEvent };

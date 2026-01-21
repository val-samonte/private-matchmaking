import { IdlAccounts, Idl } from "@coral-xyz/anchor";
import { PrivateMatchmaking } from "./idl/private_matchmaking";

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
}

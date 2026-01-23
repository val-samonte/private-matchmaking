import { IdlAccounts } from "@coral-xyz/anchor";
import { PrivateMatchmaking } from "./idl/private_matchmaking";
import { AnchorRockPaperScissor } from "./idl/anchor_rock_paper_scissor";

export type { PrivateMatchmaking, AnchorRockPaperScissor };

export type PlayerProfile = IdlAccounts<AnchorRockPaperScissor>["playerProfile"];
export type Game = IdlAccounts<AnchorRockPaperScissor>["game"];

export type QueueHead = IdlAccounts<PrivateMatchmaking>["queueHead"];
export type QueuePage = IdlAccounts<PrivateMatchmaking>["queuePage"];
export type PlayerStatus = IdlAccounts<PrivateMatchmaking>["playerStatus"];

export interface MatchmakingClientConfig {
    confirmOptions?: import("@solana/web3.js").ConfirmOptions;
    payer?: import("@solana/web3.js").PublicKey;
}

export interface MatchFoundEvent {
    queue: import("@solana/web3.js").PublicKey;
    playerA: import("@solana/web3.js").PublicKey;
    playerB: import("@solana/web3.js").PublicKey;
    eloA: import("@coral-xyz/anchor").BN;
    eloB: import("@coral-xyz/anchor").BN;
    timestamp: import("@coral-xyz/anchor").BN;
}

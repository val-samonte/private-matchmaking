import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature, ConfirmOptions, Keypair } from "@solana/web3.js";
import { PrivateMatchmaking } from "./types";
export declare class MatchmakingPlayer {
    program: Program<PrivateMatchmaking>;
    provider: AnchorProvider;
    constructor(provider: AnchorProvider, programId?: PublicKey);
    /**
     * Join Queue (TEE Aware)
     */
    joinQueue(queue: PublicKey, tenant: PublicKey, playerData: PublicKey, confirmOptions?: ConfirmOptions, signers?: Keypair[]): Promise<TransactionSignature>;
}

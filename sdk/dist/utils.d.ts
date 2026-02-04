/// <reference types="bn.js" />
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
export declare function deriveQueuePda(programId: PublicKey, authority: PublicKey, queueId: string): PublicKey;
export declare function derivePagePda(programId: PublicKey, queue: PublicKey, index: BN | number): PublicKey;
export declare function derivePlayerStatusPda(programId: PublicKey, playerGameAccount: PublicKey): PublicKey;

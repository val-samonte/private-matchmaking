import { type Instruction, type SolanaRpcApi, type Rpc, type TransactionSigner } from "@solana/kit";
type SolanaRpc = Rpc<SolanaRpcApi>;
/**
 * Build, sign with a Kit keypair signer, and send a single instruction.
 */
export declare function sendInstruction(rpc: SolanaRpc, instruction: Instruction, signer: TransactionSigner): Promise<string>;
/**
 * Build, sign, and send multiple instructions in a single transaction.
 */
export declare function sendInstructions(rpc: SolanaRpc, instructions: Instruction[], signer: TransactionSigner): Promise<string>;
export {};

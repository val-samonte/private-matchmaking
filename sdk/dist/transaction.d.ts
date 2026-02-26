import { type Instruction, type SolanaRpcApi, type Rpc, type TransactionSigner } from "@solana/kit";
type SolanaRpc = Rpc<SolanaRpcApi>;
/**
 * Build, sign with a Kit keypair signer, and send a single instruction.
 * Throws if the transaction is rejected or times out.
 */
export declare function sendInstruction(rpc: SolanaRpc, instruction: Instruction, signer: TransactionSigner): Promise<string>;
/**
 * Build, sign, and send multiple instructions in a single transaction.
 * Throws if the transaction is rejected or times out.
 */
export declare function sendInstructions(rpc: SolanaRpc, instructions: Instruction[], signer: TransactionSigner): Promise<string>;
export {};

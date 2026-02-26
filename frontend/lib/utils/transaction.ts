import {
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  pipe,
  type Instruction,
  type SolanaRpcApi,
  type Rpc,
} from "@solana/kit";
import type { KitWallet } from "./wallet-bridge";

type SolanaRpc = Rpc<SolanaRpcApi>;

/**
 * Build, sign, and send a single instruction as a v0 transaction.
 * Returns the transaction signature.
 */
export async function sendInstruction(
  rpc: SolanaRpc,
  instruction: Instruction,
  wallet: KitWallet,
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg: any = pipe(
    createTransactionMessage({ version: 0 as const }),
    (m) => setTransactionMessageFeePayer(wallet.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unsignedTx = compileTransaction(msg as any);

  // Get wire format with zero-filled signature slots
  const base64Wire = getBase64EncodedWireTransaction(unsignedTx);

  // Decode base64 to bytes for wallet signing
  const wireBytes = Uint8Array.from(getBase64Encoder().encode(base64Wire));

  // Sign via Wallet Standard
  const signedBytes = await wallet.signTransaction(wireBytes);

  // Re-encode to base64 for sendTransaction RPC call
  const signedBase64 = btoa(String.fromCharCode(...signedBytes));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rpc.sendTransaction(signedBase64 as any, {
    encoding: "base64",
    skipPreflight: true,
  }).send() as Promise<string>;
}

/**
 * Build, sign, and send multiple instructions in a single v0 transaction.
 */
export async function sendInstructions(
  rpc: SolanaRpc,
  instructions: Instruction[],
  wallet: KitWallet,
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any = pipe(
    createTransactionMessage({ version: 0 as const }),
    (m) => setTransactionMessageFeePayer(wallet.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  );

  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix, msg);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unsignedTx = compileTransaction(msg as any);
  const base64Wire = getBase64EncodedWireTransaction(unsignedTx);
  const wireBytes = Uint8Array.from(getBase64Encoder().encode(base64Wire));
  const signedBytes = await wallet.signTransaction(wireBytes);
  const signedBase64 = btoa(String.fromCharCode(...signedBytes));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rpc.sendTransaction(signedBase64 as any, {
    encoding: "base64",
    skipPreflight: true,
  }).send() as Promise<string>;
}

import {
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  pipe,
  type Instruction,
  type SolanaRpcApi,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";

type SolanaRpc = Rpc<SolanaRpcApi>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bigIntReplacer = (_: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v;

/**
 * Poll for transaction confirmation and throw if it failed.
 * This ensures callers always know immediately when a transaction is rejected.
 */
async function confirmTransaction(rpc: SolanaRpc, sig: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statuses = await (rpc as any).getSignatureStatuses([sig], { searchTransactionHistory: false }).send().catch(() => null);
    const status = statuses?.value?.[0];
    if (status) {
      if (status.err) {
        throw new Error(`[TX] ${sig.slice(0, 16)}... FAILED: ${JSON.stringify(status.err, bigIntReplacer)}`);
      }
      console.log(`[TX] ${sig.slice(0, 16)}... ${status.confirmationStatus}`);
      return;
    }
  }
  // No status after 8s — treat as timeout rather than silently succeeding
  throw new Error(`[TX] ${sig.slice(0, 16)}... confirmation timeout (no status after 8s)`);
}

/**
 * Build, sign with a Kit keypair signer, and send a single instruction.
 * Throws if the transaction is rejected or times out.
 */
export async function sendInstruction(
  rpc: SolanaRpc,
  instruction: Instruction,
  signer: TransactionSigner,
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: any = pipe(
    createTransactionMessage({ version: 0 as const }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );

  const signedTx = await signTransactionMessageWithSigners(tx);
  const encoded = getBase64EncodedWireTransaction(signedTx);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig = await (rpc.sendTransaction(encoded as any, {
    encoding: "base64",
    skipPreflight: true,
  }).send() as Promise<string>);

  await confirmTransaction(rpc, sig);
  return sig;
}

/**
 * Build, sign, and send multiple instructions in a single transaction.
 * Throws if the transaction is rejected or times out.
 */
export async function sendInstructions(
  rpc: SolanaRpc,
  instructions: Instruction[],
  signer: TransactionSigner,
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: any = pipe(
    createTransactionMessage({ version: 0 as const }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  const signedTx = await signTransactionMessageWithSigners(tx);
  const encoded = getBase64EncodedWireTransaction(signedTx);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sig = await (rpc.sendTransaction(encoded as any, {
    encoding: "base64",
    skipPreflight: true,
  }).send() as Promise<string>);

  await confirmTransaction(rpc, sig);
  return sig;
}

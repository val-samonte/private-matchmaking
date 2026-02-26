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

/**
 * Build, sign with a Kit keypair signer, and send a single instruction.
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

  // Poll for status to detect runtime errors
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statuses = await (rpc as any).getSignatureStatuses([sig], { searchTransactionHistory: false }).send().catch(() => null);
    const status = statuses?.value?.[0];
    if (status) {
      if (status.err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.error(`[TX] ${sig.slice(0, 16)}... FAILED:`, JSON.stringify(status.err, (_, v) => typeof v === 'bigint' ? v.toString() : v));
      } else if (status.confirmationStatus) {
        console.log(`[TX] ${sig.slice(0, 16)}... ${status.confirmationStatus}`);
      }
      break;
    }
  }
  return sig;
}

/**
 * Build, sign, and send multiple instructions in a single transaction.
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
  return rpc.sendTransaction(encoded as any, {
    encoding: "base64",
    skipPreflight: true,
  }).send() as Promise<string>;
}

import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/ui";
import { getWalletFeature } from "@wallet-standard/react";
import {
  SolanaSignTransaction,
  SolanaSignMessage,
  type SolanaSignTransactionFeature,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";

export interface AnchorCompatWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Bridge a Wallet Standard wallet into an Anchor-compatible wallet interface.
 * This bypasses StandardWalletAdapter entirely — no chain check, no broken
 * signTransaction wrapper, no "Network mismatch" errors.
 */
export function createWalletBridge(
  wallet: UiWallet,
  account: UiWalletAccount
): AnchorCompatWallet {
  const publicKey = new PublicKey(account.address);

  // Access wallet standard features directly
  const signTxFeature = getWalletFeature(wallet, SolanaSignTransaction) as
    SolanaSignTransactionFeature[typeof SolanaSignTransaction];

  return {
    publicKey,

    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      // Serialize the transaction
      const serialized = tx instanceof VersionedTransaction
        ? tx.serialize()
        : tx.serialize({ requireAllSignatures: false, verifySignatures: false });

      const [result] = await signTxFeature.signTransaction({
        transaction: serialized,
        account,
      });

      // Deserialize back to the same type
      if (tx instanceof VersionedTransaction) {
        return VersionedTransaction.deserialize(result.signedTransaction) as T;
      }
      return Transaction.from(result.signedTransaction) as T;
    },

    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      const inputs = txs.map((tx) => ({
        transaction: tx instanceof VersionedTransaction
          ? tx.serialize()
          : tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
        account,
      }));

      const results = await signTxFeature.signTransaction(...inputs);

      return results.map((result, i) => {
        if (txs[i] instanceof VersionedTransaction) {
          return VersionedTransaction.deserialize(result.signedTransaction);
        }
        return Transaction.from(result.signedTransaction);
      }) as T[];
    },

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      const signMsgFeature = getWalletFeature(wallet, SolanaSignMessage) as
        SolanaSignMessageFeature[typeof SolanaSignMessage];

      const [result] = await signMsgFeature.signMessage({
        message,
        account,
      });

      return result.signature;
    },
  };
}

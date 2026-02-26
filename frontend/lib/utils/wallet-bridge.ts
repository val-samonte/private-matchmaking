import type { UiWallet, UiWalletAccount } from "@wallet-standard/ui";
import { getWalletFeature } from "@wallet-standard/react";
import {
  SolanaSignTransaction,
  SolanaSignMessage,
  type SolanaSignTransactionFeature,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";
import {
  getTransactionEncoder,
  type Address,
  type TransactionPartialSigner,
  type SignatureBytes,
} from "@solana/kit";

export interface KitWallet {
  address: Address;
  signTransaction(wireBytes: Uint8Array): Promise<Uint8Array>;
  signAllTransactions(txs: Uint8Array[]): Promise<Uint8Array[]>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Bridge a Wallet Standard wallet into a Kit-compatible wallet interface.
 * This bypasses StandardWalletAdapter entirely — no chain check, no broken
 * signTransaction wrapper, no "Network mismatch" errors.
 */
export function createWalletBridge(
  wallet: UiWallet,
  account: UiWalletAccount
): KitWallet {
  const signTxFeature = getWalletFeature(wallet, SolanaSignTransaction) as
    SolanaSignTransactionFeature[typeof SolanaSignTransaction];

  return {
    address: account.address as Address,

    async signTransaction(wireBytes: Uint8Array): Promise<Uint8Array> {
      const [result] = await signTxFeature.signTransaction({
        transaction: wireBytes,
        account,
      });
      return result.signedTransaction;
    },

    async signAllTransactions(txs: Uint8Array[]): Promise<Uint8Array[]> {
      const inputs = txs.map((tx) => ({ transaction: tx, account }));
      const results = await signTxFeature.signTransaction(...inputs);
      return results.map((r) => r.signedTransaction);
    },

    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      const signMsgFeature = getWalletFeature(wallet, SolanaSignMessage) as
        SolanaSignMessageFeature[typeof SolanaSignMessage];
      const [result] = await signMsgFeature.signMessage({ message, account });
      return result.signature;
    },
  };
}

/**
 * Adapt KitWallet to a Kit TransactionPartialSigner for use with Codama instruction builders.
 * The signer's address is used to set up account roles in instruction builders.
 * Actual signing for sendInstruction uses wallet.signTransaction directly.
 */
export function walletToSigner(wallet: KitWallet): TransactionPartialSigner {
  return {
    address: wallet.address,
    signTransactions: async (transactions) => {
      const encoder = getTransactionEncoder();
      return Promise.all(
        transactions.map(async (tx) => {
          // Encode the compiled transaction to wire format
          const wireBytes = Uint8Array.from(encoder.encode(tx));
          // Sign via Wallet Standard
          const signedBytes = await wallet.signTransaction(wireBytes);
          // Extract fee payer signature (64 bytes after the compact-u16 prefix byte 0x01)
          const sigBytes = signedBytes.slice(1, 65) as SignatureBytes;
          return { [wallet.address]: sigBytes } as Record<Address, SignatureBytes>;
        })
      );
    },
  };
}

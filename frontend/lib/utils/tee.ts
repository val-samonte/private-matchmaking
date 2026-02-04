import { PublicKey, Connection } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { WalletContextState } from "@solana/wallet-adapter-react";
import * as nacl from "tweetnacl";
import {
  getAuthToken,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-sdk";

/**
 * Get TEE authentication token
 */
export async function getTeeAuthToken(
  rpcUrl: string,
  wallet: WalletContextState
): Promise<{ token: string; expiresAt: number }> {
  if (!wallet.publicKey || !wallet.signMessage) {
    throw new Error("Wallet not connected or does not support message signing");
  }

  const signMessage = async (message: Uint8Array): Promise<Uint8Array> => {
    if (!wallet.signMessage) {
      throw new Error("Wallet does not support message signing");
    }
    return await wallet.signMessage(message);
  };

  return await getAuthToken(rpcUrl, wallet.publicKey, signMessage);
}

/**
 * Create TEE-authenticated provider
 */
export function createTeeProvider(
  rpcUrl: string,
  wsUrl: string,
  token: string,
  wallet: WalletContextState
): AnchorProvider {
  const connection = new Connection(`${rpcUrl}?token=${token}`, {
    wsEndpoint: `${wsUrl}?token=${token}`,
    commitment: "confirmed",
  });

  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
}

/**
 * Wait for account delegation to TEE
 */
export async function waitForDelegation(
  teeRpcUrl: string,
  token: string,
  pda: PublicKey
): Promise<void> {
  await waitUntilPermissionActive(`${teeRpcUrl}?token=${token}`, pda);
}

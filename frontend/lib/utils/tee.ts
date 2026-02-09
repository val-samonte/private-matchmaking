import { PublicKey, Connection } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import type { AnchorCompatWallet } from "@/lib/utils/wallet-bridge";
import {
  getAuthToken,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-sdk";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an L1 AnchorProvider using the wallet bridge.
 * skipPreflight is always true to avoid "Blockhash not found" on devnet.
 */
export function createL1Provider(
  connection: Connection,
  wallet: AnchorCompatWallet,
): AnchorProvider {
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    skipPreflight: true,
  });
}

/**
 * Get TEE authentication token using the wallet bridge's signMessage.
 */
export async function getTeeAuthToken(
  rpcUrl: string,
  wallet: AnchorCompatWallet,
): Promise<{ token: string; expiresAt: number }> {
  return await getAuthToken(
    rpcUrl,
    wallet.publicKey,
    async (message: Uint8Array) => wallet.signMessage(message),
  );
}

/**
 * Create TEE-authenticated provider.
 */
export function createTeeProvider(
  rpcUrl: string,
  wsUrl: string,
  token: string,
  wallet: AnchorCompatWallet,
): AnchorProvider {
  const connection = new Connection(`${rpcUrl}?token=${token}`, {
    wsEndpoint: `${wsUrl}?token=${token}`,
    commitment: "confirmed",
  });

  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    skipPreflight: true,
  });
}

/**
 * Wait for account delegation to TEE
 */
export async function waitForDelegation(
  teeRpcUrl: string,
  token: string,
  pda: PublicKey,
): Promise<void> {
  await waitUntilPermissionActive(`${teeRpcUrl}?token=${token}`, pda);
}

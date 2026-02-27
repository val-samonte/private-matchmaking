import { getBase58Decoder, type Address } from "@solana/kit";
import type { KitWallet } from "./wallet-bridge";

const DELEGATION_PROGRAM = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";

/**
 * Get TEE authentication token using the wallet's signMessage.
 * Uses the MagicBlock TEE challenge-sign flow.
 */
export async function getTeeAuthToken(
  rpcUrl: string,
  wallet: KitWallet,
): Promise<{ token: string; expiresAt: number }> {
  // 1. GET challenge from TEE
  const challengeRes = await fetch(
    `${rpcUrl}/auth/challenge?pubkey=${wallet.address}`
  );
  if (!challengeRes.ok) {
    throw new Error(`TEE challenge failed: ${challengeRes.statusText}`);
  }
  const { challenge } = await challengeRes.json() as { challenge: string };

  // 2. Sign challenge bytes with wallet
  const challengeBytes = new TextEncoder().encode(challenge);
  const sig = await wallet.signMessage(challengeBytes);

  // 3. POST signature (base58-encoded) to get token
  const signatureString = getBase58Decoder().decode(sig);
  const tokenRes = await fetch(`${rpcUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: wallet.address,
      challenge,
      signature: signatureString,
    }),
  });
  const authJson = await tokenRes.json() as { token: string; expiresAt?: number; error?: string };
  if (tokenRes.status !== 200) {
    throw new Error(`TEE auth failed: ${authJson.error}`);
  }
  const expiresAt = authJson.expiresAt ?? Date.now() + 1000 * 60 * 60 * 24 * 30;
  return { token: authJson.token, expiresAt };
}

/**
 * Wait for account delegation to activate on TEE.
 * Polls the TEE RPC until the account owner is the delegation program.
 */
export async function waitForDelegation(
  teeRpcUrl: string,
  token: string,
  pda: Address,
  timeoutMs = 30000,
): Promise<void> {
  const url = `${teeRpcUrl}?token=${token}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [pda, { encoding: "base64" }],
      }),
    });
    const json = await res.json();
    const owner = json?.result?.value?.owner;
    if (owner === DELEGATION_PROGRAM) return;
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`Delegation timeout after ${timeoutMs}ms for ${pda}`);
}

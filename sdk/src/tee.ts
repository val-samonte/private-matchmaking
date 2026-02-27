import {
  getBase58Decoder,
  createSignableMessage,
  type Address,
  type MessagePartialSigner,
} from "@solana/kit";

export type { MessagePartialSigner as MessageSigner };

/**
 * Authenticate with the MagicBlock TEE via challenge-sign flow.
 */
export async function getAuthToken(
  rpcUrl: string,
  signer: MessagePartialSigner,
): Promise<{ token: string; expiresAt: number }> {
  const challengeRes = await fetch(
    `${rpcUrl}/auth/challenge?pubkey=${signer.address}`
  );
  if (!challengeRes.ok) {
    throw new Error(`TEE challenge failed: ${challengeRes.statusText}`);
  }
  const { challenge } = (await challengeRes.json()) as { challenge: string };

  const challengeBytes = new TextEncoder().encode(challenge);
  const [sigDict] = await signer.signMessages([createSignableMessage(challengeBytes)]);
  const signature = sigDict[signer.address as Address];
  const signatureString = getBase58Decoder().decode(signature);

  const tokenRes = await fetch(`${rpcUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: signer.address,
      challenge,
      signature: signatureString,
    }),
  });
  const authJson = (await tokenRes.json()) as { token: string; expiresAt?: number; error?: string };
  if (tokenRes.status !== 200) {
    throw new Error(`Failed to authenticate: ${authJson.error}`);
  }
  const expiresAt = authJson.expiresAt ?? Date.now() + 1000 * 60 * 60 * 24 * 30;
  return { token: authJson.token, expiresAt };
}

/**
 * Poll the TEE until the Permission PDA for the given account is active (authorizedUsers non-empty).
 * This confirms the TEE has picked up the delegated Permission PDA and is enforcing access control.
 * Returns true if active before timeout, false otherwise.
 */
export async function waitForPermission(
  teeUrlWithToken: string,
  accountAddress: Address,
  timeoutMs = 10000,
): Promise<boolean> {
  const [baseUrl, token] = teeUrlWithToken.replace("/?", "?").split("?");
  const permUrl = token
    ? `${baseUrl}/permission?${token}&pubkey=${accountAddress}`
    : `${baseUrl}/permission?pubkey=${accountAddress}`;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(permUrl);
      const json = (await res.json()) as { authorizedUsers?: unknown[] | null };
      if (json.authorizedUsers && json.authorizedUsers.length > 0) return true;
    } catch {
      // ignore transient errors
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}


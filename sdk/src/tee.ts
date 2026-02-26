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
 * Poll the TEE /permission endpoint until the given PDA has authorized users,
 * indicating delegation is active. Returns false on timeout (does not throw).
 */
export async function waitUntilPermissionActive(
  teeUrlWithToken: string,
  pda: Address,
  timeoutMs = 30000,
): Promise<boolean> {
  // Parse URL: "https://host/path?token=xxx" -> baseUrl="https://host/path", tokenParam="token=xxx"
  const [baseUrl, tokenParam] = teeUrlWithToken.replace("/?", "?").split("?");
  let permissionUrl: string;
  if (tokenParam) {
    permissionUrl = `${baseUrl}/permission?${tokenParam}&pubkey=${pda}`;
  } else {
    permissionUrl = `${baseUrl}/permission?pubkey=${pda}`;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(permissionUrl);
      if (res.ok) {
        const { authorizedUsers } = (await res.json()) as { authorizedUsers?: unknown[] };
        if (authorizedUsers && authorizedUsers.length > 0) return true;
      }
    } catch {
      // ignore transient errors, keep polling
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

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
 * indicating delegation is active. Throws on timeout.
 *
 * IMPORTANT: the /permission endpoint must be called WITHOUT the auth token.
 * Polling /permission?token=JWT&pubkey=PDA returns per-user access (always empty
 * until you're explicitly added), not the global delegation activation status.
 * The reference implementation (anchor-rock-paper-scissor) confirms this by
 * passing the bare endpoint URL with no token.
 */
export async function waitUntilPermissionActive(
  teeUrlWithToken: string,
  pda: Address,
  timeoutMs = 120000,
): Promise<void> {
  // Always strip the token — /permission?pubkey=PDA is the correct check
  const [baseUrl] = teeUrlWithToken.replace("/?", "?").split("?");
  const permissionUrl = `${baseUrl}/permission?pubkey=${pda}`;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(permissionUrl);
      if (res.ok) {
        const { authorizedUsers } = (await res.json()) as { authorizedUsers?: unknown[] };
        if (authorizedUsers && authorizedUsers.length > 0) return;
      }
    } catch {
      // ignore transient errors, keep polling
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Delegation timeout: PDA ${pda} did not become active in TEE within ${timeoutMs}ms`);
}

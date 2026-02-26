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
 * Poll the TEE /permission endpoint until the given PDA shows delegation is active.
 *
 * IMPORTANT: `authorizedUsers` is only populated for PER-group delegation. For
 * DELeGG-based delegation (what this project uses), this function logs the full
 * response on timeout so we can identify the correct field. It does NOT throw on
 * timeout — the TEE operation itself is the real failure signal.
 *
 * The /permission endpoint is always called WITHOUT the auth token.
 * /permission?token=JWT&pubkey=PDA returns per-user access (always empty unless
 * explicitly granted via PER groups), not global delegation activation status.
 */
export async function waitUntilPermissionActive(
  teeUrlWithToken: string,
  pda: Address,
  timeoutMs = 15000,
): Promise<boolean> {
  // Always strip the token — /permission?pubkey=PDA is the correct global check
  const [baseUrl] = teeUrlWithToken.replace("/?", "?").split("?");
  const permissionUrl = `${baseUrl}/permission?pubkey=${pda}`;

  const start = Date.now();
  let lastResponse: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(permissionUrl);
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        lastResponse = json;
        const { authorizedUsers } = json as { authorizedUsers?: unknown[] };
        if (authorizedUsers && authorizedUsers.length > 0) {
          console.log(`[TEE] ${pda.slice(0, 16)}... delegation active`);
          return true;
        }
      }
    } catch {
      // ignore transient errors, keep polling
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // Warn with full response to diagnose which field to check for DELeGG delegation
  console.warn(`[TEE] ${pda.slice(0, 16)}... not confirmed after ${timeoutMs}ms. /permission response: ${JSON.stringify(lastResponse)}`);
  return false;
}

import { type Address, type MessagePartialSigner } from "@solana/kit";
export type { MessagePartialSigner as MessageSigner };
/**
 * Authenticate with the MagicBlock TEE via challenge-sign flow.
 */
export declare function getAuthToken(rpcUrl: string, signer: MessagePartialSigner): Promise<{
    token: string;
    expiresAt: number;
}>;
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
export declare function waitUntilPermissionActive(teeUrlWithToken: string, pda: Address, timeoutMs?: number): Promise<void>;

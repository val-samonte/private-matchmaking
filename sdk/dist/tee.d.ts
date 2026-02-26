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
export declare function waitUntilPermissionActive(teeUrlWithToken: string, pda: Address, timeoutMs?: number): Promise<boolean>;

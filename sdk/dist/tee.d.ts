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
 * indicating delegation is active. Returns false on timeout (does not throw).
 */
export declare function waitUntilPermissionActive(teeUrlWithToken: string, pda: Address, timeoutMs?: number): Promise<boolean>;

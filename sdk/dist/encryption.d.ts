export declare class EncryptionProvider {
    private keyPair;
    private get crypto();
    /**
     * Generate a fresh ephemeral keypair for the session (X25519/P-256).
     */
    generateSessionKey(): Promise<CryptoKey>;
    /**
     * Derive shared secret and encrypt payload.
     */
    encryptPayload(data: Uint8Array, teePublicKeyBytes: Uint8Array): Promise<{
        encrypted: Uint8Array;
        clientPublicKey: Uint8Array;
    }>;
    /**
     * Decrypt a response from the TEE.
     */
    decryptResponse(encryptedData: Uint8Array, teePublicKeyBytes: Uint8Array): Promise<Uint8Array>;
    /**
     * Helper to generate a valid random P-256 Public Key (65 bytes) for testing.
     */
    createMockValidatorKey(): Promise<Uint8Array>;
}

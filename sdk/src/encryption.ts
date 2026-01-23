import { PublicKey } from "@solana/web3.js";
// import { x25519 } from "@noble/curves/ed25519"; 

export class EncryptionProvider {
    private keyPair: CryptoKeyPair | null = null;
    
    // Check for crypto availability
    private get crypto(): Crypto {
        if (typeof globalThis.crypto !== 'undefined') {
            return globalThis.crypto;
        }
        // Fallback for Node < 19 if global crypto not set (though SDK likely targets modern envs)
        try {
            return require('crypto').webcrypto;
        } catch (e) {
            throw new Error("WebCrypto API not available.");
        }
    }

    /**
     * Generate a fresh ephemeral keypair for the session (X25519/P-256).
     */
    async generateSessionKey(): Promise<CryptoKey> {
        this.keyPair = await this.crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256", 
            },
            true,
            ["deriveKey", "deriveBits"]
        ) as CryptoKeyPair;
        
        return this.keyPair.publicKey;
    }

    /**
     * Derive shared secret and encrypt payload.
     */
    async encryptPayload(
        data: Uint8Array, 
        teePublicKeyBytes: Uint8Array
    ): Promise<{ encrypted: Uint8Array, clientPublicKey: Uint8Array }> {
        if (!this.keyPair) {
            await this.generateSessionKey();
        }

        // Import TEE Public Key
        // Fix: Explicitly cast to BufferSource/any because TS gets confused with SharedArrayBuffer in some envs
        const teeKey = await this.crypto.subtle.importKey(
            "raw",
            teePublicKeyBytes as unknown as BufferSource,
            { name: "ECDH", namedCurve: "P-256" }, 
            false,
            []
        );

        // Derive Shared Secret (AES-GCM Key)
        const sharedKey = await this.crypto.subtle.deriveKey(
            {
                name: "ECDH",
                public: teeKey,
            },
            this.keyPair!.privateKey,
            {
                name: "AES-GCM",
                length: 256,
            },
            false,
            ["encrypt", "decrypt"]
        );

        // Encrypt Data
        const iv = this.crypto.getRandomValues(new Uint8Array(12));
        const encryptedBuffer = await this.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            sharedKey,
            data as unknown as BufferSource
        );

        // Concatenate IV + CipherText
        const encrypted = new Uint8Array(iv.length + encryptedBuffer.byteLength);
        encrypted.set(iv);
        encrypted.set(new Uint8Array(encryptedBuffer), iv.length);

        // Export Client Public Key
        const clientPubRaw = await this.crypto.subtle.exportKey("raw", this.keyPair!.publicKey);

        return {
            encrypted,
            clientPublicKey: new Uint8Array(clientPubRaw)
        };
    }
    
    /**
     * Decrypt a response from the TEE.
     */
    async decryptResponse(
        encryptedData: Uint8Array, 
        teePublicKeyBytes: Uint8Array
    ): Promise<Uint8Array> {
          if (!this.keyPair) throw new Error("No session key");
          
           // Import TEE Public Key
        const teeKey = await this.crypto.subtle.importKey(
            "raw",
            teePublicKeyBytes as unknown as BufferSource,
            { name: "ECDH", namedCurve: "P-256" }, 
            false,
            []
        );

        // Derive Shared Secret
        const sharedKey = await this.crypto.subtle.deriveKey(
            {
                name: "ECDH",
                public: teeKey,
            },
            this.keyPair!.privateKey,
            {
                name: "AES-GCM",
                length: 256,
            },
            false,
            ["encrypt", "decrypt"]
        );
        
        const iv = encryptedData.slice(0, 12);
        const ciphertext = encryptedData.slice(12);
        
        const decrypted = await this.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            sharedKey,
            ciphertext as unknown as BufferSource
        );
        
        return new Uint8Array(decrypted);
    }

    /**
     * Helper to generate a valid random P-256 Public Key (65 bytes) for testing.
     */
    async createMockValidatorKey(): Promise<Uint8Array> {
        const pair = await this.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true, 
            ["deriveKey"]
        ) as CryptoKeyPair;
        const raw = await this.crypto.subtle.exportKey("raw", pair.publicKey);
        return new Uint8Array(raw);
    }
}

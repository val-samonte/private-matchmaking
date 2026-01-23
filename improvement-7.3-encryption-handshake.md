# Improvement 7.3: Encryption Handshake Details

## 1. Problem Description
The whitepaper mentions "Encrypted State" but lacks the implementation details of *how* the client encrypts the data before sending it to the TEE. Without a standardized handshake, frontends are left guessing how to protect their inputs (e.g., Rock/Paper/Scissor choice).

## 2. Proposed Solution
Standardize the **MagicBlock Client Encryption Flow** in the SDK and documentation.

### The Flow
1.  **Attestation Check**: Use `ephemeral-rollups-sdk` to verify the TEE's signature and retrieve its **Public Key**.
2.  **Session Key Generation**: Client generates an ephemeral keypair (ECDH).
3.  **Shared Secret**: Client derives `SharedSecret = ECDH(ClientPriv, TEEPub)`.
4.  **AES-GCM**: Client encrypts the Instruction Arguments (e.g., `Choice::Rock`) using AES-GCM with the Shared Secret.
5.  **Submission**: The transaction payload is just the Encrypted Blob + Client Public Key (so TEE can perform the other side of ECDH).

## 3. Implementation Plan

### SDK Changes (`sdk/src`)
1.  **Add `EncryptionProvider`**: A utility class in the TypeScript SDK.
    -   `async encryptInstruction(ix, teePubkey)`
    -   `async decryptEvent(eventData, sharedSecret)`
2.  **Integrate with Anchor**: Extend `MatchmakingClient` to automatically look up the TEE key for the target Queue and wrap instructions.

### Documentation
1.  **Spec Guide**: Write `encryption-spec.md` detailing the curve (e.g., X25519 vs Secp256k1) and cipher (AES-256-GCM) parameters.

## 4. Work Estimation
-   **Complexity**: Medium (Crypto correctness is critical).
-   **Impact**: Critical (Real privacy depends on this).

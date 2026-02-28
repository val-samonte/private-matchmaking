# Known Issues — Must Fix Before Production

---
## 1. Clarify the privacy model before any public launch

**Severity: LOW / Documentation**

**What "private matchmaking" means here:**
- Queue state is hidden from **L1 observers** (anyone reading Solana devnet can't see who's queued)
- Queue state is **NOT** hidden from the TEE operator (MagicBlock can read all queue data with a valid auth token)
- This is privacy-from-the-public, not end-to-end encryption

**What needs to happen:**
- README / whitepaper must state: "Matchmaking data is held in a Trusted Execution Environment (TEE) and is not written to L1 while the queue is active. The TEE operator can read queue state."
- If stronger privacy (hidden from operator) is required, investigate whether MagicBlock's TEE provides confidential compute guarantees (SGX/TDX attestation)

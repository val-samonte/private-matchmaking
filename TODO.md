# Known Issues — Must Fix Before Production

---
## 1. "Privacy" is stale state, not encryption

**Severity: LOW / Design decision**

The privacy test passes because L1 sees 0 queue entries — not because the matchmaking data is encrypted. The TEE holds the live queue state and L1 is simply never updated while delegation is active. Anyone with a valid TEE auth token can read the full queue state via the TEE RPC.

**Impact:**
- If this product is advertised as "private matchmaking," the privacy model needs to be accurately described: it is privacy-from-L1-observers, not privacy-from-TEE-operators
- The TEE operator (MagicBlock) can in principle read all queue data

**What needs to happen:**
- Clarify the privacy model in documentation and the whitepaper
- If stronger privacy is needed, investigate whether MagicBlock TEE provides confidential compute guarantees (i.e., whether the TEE operator can actually read account data)

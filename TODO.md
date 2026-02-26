# Known Issues — Must Fix Before Production

---

## 1. ELO is never committed back to L1 after a game

**Severity: HIGH**

Player profiles are delegated to the TEE at the start of gameplay so `makeChoice` can update ELO in real time. But there is no `commit_profiles` or equivalent step — profiles stay delegated to the TEE indefinitely. On L1, player ELO is frozen at whatever it was before delegation.

Game sessions have the same problem: they are delegated, the result is computed on TEE, but they are never committed back. L1 has no record of who won.

**Impact:** Rankings, leaderboards, and any on-chain ELO verification are permanently wrong. Third parties reading L1 see stale data.

**What needs to happen:**
- After `persist_results`, commit game session + both player profiles back to L1
- Add a `commitGame` (or similar) SDK method and a corresponding test assertion that L1 ELO is updated
- Decide on who is responsible for triggering this commit (queue authority? either player?)

---

## 2. `waitUntilPermissionActive` is a blind 15-second sleep

**Severity: MEDIUM**

`waitUntilPermissionActive` was written to poll the TEE `/permission` endpoint and wait for `authorizedUsers` to become non-empty. This check only works for PER-group delegation. This project uses **DELeGG-based delegation**, for which the endpoint always returns `{"authorizedUsers": null}`.

The function now warns and proceeds after 15 seconds regardless — it is functionally identical to `await sleep(15000)`. There is no actual check that the TEE has indexed the delegated account.

**Impact:**
- If the TEE is slower than 15 seconds on a given day, the subsequent TEE transaction fails with a cryptic error that does not mention delegation as the cause
- 90 seconds of dead wait per full test run (6 calls × 15s each)
- The function name implies a guarantee it cannot provide

**What needs to happen:**
- Investigate whether `getAccountInfo` on the TEE RPC returns null for non-delegated accounts (if so, poll that instead)
- OR find the correct DELeGG-specific field in the `/permission` response (open a support ticket with MagicBlock)
- Replace the blind sleep with a real activation check, or at minimum reduce the wait to something empirically determined

---

## 3. `anchor test` cannot redeploy programs (buffer too small)

**Severity: MEDIUM**

Running `anchor test` fails at the deploy step:

```
Error: Buffer account data size (400989) is smaller than the minimum size (428317)
```

The deployed program binary has grown beyond the original buffer allocation. `anchor test` always tries to redeploy, so tests can only be run via direct mocha (`npx tsx ... _mocha ...`).

**Impact:**
- Any future Anchor program change cannot be deployed via the normal `anchor test` workflow
- CI/CD pipelines using `anchor test` will break

**What needs to happen:**
- Extend the buffer: `solana program extend <PROGRAM_ID> <ADDITIONAL_BYTES> --url devnet`
- OR redeploy from scratch: close the old program, deploy fresh with a correctly-sized buffer
- Document the manual deploy command in the repo so future contributors don't get stuck

---

## 4. "Privacy" is stale state, not encryption

**Severity: LOW / Design decision**

The privacy test passes because L1 sees 0 queue entries — not because the matchmaking data is encrypted. The TEE holds the live queue state and L1 is simply never updated while delegation is active. Anyone with a valid TEE auth token can read the full queue state via the TEE RPC.

**Impact:**
- If this product is advertised as "private matchmaking," the privacy model needs to be accurately described: it is privacy-from-L1-observers, not privacy-from-TEE-operators
- The TEE operator (MagicBlock) can in principle read all queue data

**What needs to happen:**
- Clarify the privacy model in documentation and the whitepaper
- If stronger privacy is needed, investigate whether MagicBlock TEE provides confidential compute guarantees (i.e., whether the TEE operator can actually read account data)

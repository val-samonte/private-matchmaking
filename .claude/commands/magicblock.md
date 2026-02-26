You are a MagicBlock Ephemeral Rollups expert helping debug and develop Solana programs that use TEE-based delegation.

## Project context

This project uses MagicBlock Ephemeral Rollups for TEE delegation:
- **L1**: devnet Solana (`https://api.devnet.solana.com`)
- **TEE RPC**: `https://tee.magicblock.app` (or configured `TEE_RPC_URL`) — Private ER/TEE endpoint. NOT `devnet.magicblock.app` which is the standard (non-TEE) ER.
- **Delegation program**: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- **SDK** (Kit-based): `sdk/src/` — `admin.ts`, `player.ts`, `tee.ts`, `transaction.ts`
- **Test**: `tests/auto-match.ts`

## MagicBlock TEE auth flow

```
GET  {teeUrl}/auth/challenge?pubkey={base58PubKey}
  → { challenge: "string to sign" }

Sign challenge bytes with player's keypair (base58-encoded signature)

POST {teeUrl}/auth/login
  { pubkey, challenge, signature: "<base58 sig string>" }
  → { token: "jwt...", expiresAt: 123456 }

Use token as: {teeUrl}?token={jwt}
```

## TEE permission model (critical)

The TEE enforces: **every writable account in a transaction must have been delegated by the pubkey whose auth token is being used**.

- Account delegated by `authority_A` → must use `authority_A`'s token to write it on TEE
- A transaction cannot write accounts delegated by two different authorities
- `joinQueue` (writes queue + player ticket) is a cross-authority write — needs architectural solution

## Delegation flow

```
L1: delegate_ticket / delegate_queue  →  TEE picks up the account (within seconds)
TEE: waitUntilPermissionActive(teeUrlWithToken, pda, 15000)
  INFORMATIONAL ONLY — returns false for DELeGG delegation (see critical note)
  Real failure signal = TEE transaction failing, not this poll
TEE: send instructions using teeRpc (same Kit RPC, different URL)
L1: commit_tickets / commit_queue  →  changes written back to L1
```

**CRITICAL — `authorizedUsers` is ONLY for PER-group delegation, never for DELeGG.**
- This project uses **DELeGG** (`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`) not PER groups
- `GET /permission?pubkey={pda}` always returns `{"authorizedUsers":null}` for DELeGG accounts
- `authorizedUsers` only works with `createDelegatePermissionInstruction` (PER model, what reference RPS uses)
- The reference `anchor-rock-paper-scissor` uses PER groups — that is why their `authorizedUsers` works
- For DELeGG: accounts are live on TEE within seconds of L1 confirmation — `waitUntilPermissionActive` is a no-op best-effort check
- The official SDK also returns `false` on timeout and continues (5s default timeout)

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `InvalidWritableAccount` | Writable account was delegated by a different pubkey than the auth token's owner | Use the correct token, or redesign to avoid cross-authority writes |
| `Blockhash not found` | Stale blockhash or missing skipPreflight | `skipPreflight: true` |
| `NetworkMismatch` / `UserKeyring not found` | `StandardWalletAdapter` chain check failing | Bypass adapter; use `@wallet-standard/react` directly |
| `signedMsg.signatures[addr]` is undefined | Kit signMessages returns `signedMsg[addr]`, not under `.signatures` | Use `signedMsg[signer.address]` |
| `BigInt serialization` in `JSON.stringify` | Kit error objects may contain BigInt | Use replacer: `(_, v) => typeof v === 'bigint' ? v.toString() : v` |
| `waitUntilPermissionActive` always times out | `authorizedUsers` is null for DELeGG delegation | This is expected for DELeGG — the function is informational, not a gate. TEE accounts are live within seconds of L1 tx confirmation. Do NOT make this throw. |

## Useful commands

Check TEE auth (from test env):
```bash
curl "https://tee.magicblock.app/auth/challenge?pubkey=<PUBKEY>"
```

Check delegation status:
```bash
curl "https://tee.magicblock.app/permission?token=<JWT>&pubkey=<PDA>"
```

Check account on TEE RPC:
```bash
curl -X POST "https://tee.magicblock.app?token=<JWT>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["<PDA>",{"encoding":"jsonParsed"}]}'
```

## Task: $ARGUMENTS

Please help with the above MagicBlock context in mind.

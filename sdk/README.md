# @1upmonster/duel

TypeScript SDK for **Duel** — a privacy-preserving matchmaking protocol on Solana using MagicBlock Ephemeral Rollups (TEE).

Built on [`@solana/kit`](https://github.com/anza-xyz/kit). No `@coral-xyz/anchor` or legacy `web3.js` dependency.

## Installation

```bash
npm install @1upmonster/duel
```

## Quick Start

### For Game Owners (`MatchmakingAdmin`)

```typescript
import { MatchmakingAdmin } from "@1upmonster/duel";
import { createSolanaRpc, createKeyPairSignerFromBytes } from "@solana/kit";
import * as crypto from "crypto";

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const signer = await createKeyPairSignerFromBytes(/* your keypair bytes */);
const admin = new MatchmakingAdmin(rpc, signer);

// 1. Initialize Tenant — stores callback config on L1
const callbackDiscriminator = Array.from(
  crypto.createHash("sha256").update("global:on_match_found").digest().slice(0, 8)
);
await admin.initializeTenant(YOUR_GAME_PROGRAM_ID, {
  eloWindow: 100n,       // max ELO diff for a match
  eloOffset: 40,         // byte offset of ELO in player account
  eloDataType: "u64",    // u8 | u16 | u32 | u64
  callbackProgramId: YOUR_GAME_PROGRAM_ID,
  callbackDiscriminator,
});

// 2. Create and delegate queue to TEE (automatically sets up permission PDA)
const authority = signer.address;
await admin.initializeQueue(authority, tenantPda);
await admin.delegateQueue(authority, validatorPubkey);
// Queue is now a dark pool: only the queue authority's TEE token can read it

// 3. After players have matched, flush opponent tickets + commit all to L1
await admin.resolveMatches(queuePda, tenantPda, [p1TicketPda, p2TicketPda]);
```

### For Players (`MatchmakingPlayer`)

```typescript
import { MatchmakingPlayer } from "@1upmonster/duel";
import { getAuthToken } from "@1upmonster/duel";
import { createSolanaRpc } from "@solana/kit";

const l1Rpc = createSolanaRpc("https://api.devnet.solana.com");
const player = new MatchmakingPlayer(l1Rpc, signer);

// High-level: creates ticket on L1, delegates to TEE, joins queue in one call
const { token } = await getAuthToken("https://tee.magicblock.app", signer);
const teeRpc = createSolanaRpc(`https://tee.magicblock.app?token=${token}`);

const ticketPda = await player.enterQueue(
  tenantPda,
  queuePda,
  playerProfilePda,
  teeRpc,
  `https://tee.magicblock.app?token=${token}`,
  validatorPubkey,        // optional TEE validator
  YOUR_GAME_PROGRAM_ID,   // optional: callback fires via Tenant PDA when matched
);

// Poll L1 until the ticket shows Matched status
const match = await player.pollForMatch(ticketPda);
// match = { opponent: Address, matchId: bigint }
```

## API Reference

### `MatchmakingAdmin`

**Constructor:** `new MatchmakingAdmin(rpc, signer, programId?)`

| Method | Description |
|---|---|
| `initializeTenant(tenantProgramId, options?)` | Create Tenant PDA with ELO config and optional callback |
| `initializeQueue(authority, tenant)` | Create Queue PDA linked to tenant |
| `delegateQueue(authority, validator?)` | Delegate queue to TEE + set up Permission PDA (only authority can read via TEE RPC) |
| `flushMatches(queue, tenant, ticketPdas)` | Update opponent tickets from pending matches |
| `commitTickets(tenant, ticketPdas)` | Push matched ticket state back to L1 |
| `resolveMatches(queue, tenant, ticketPdas, settlementDelayMs?)` | High-level: flush + wait + commit |
| `getQueue(queuePda)` | Fetch queue account |
| `getQueuePda(authority)` | Derive queue PDA |
| `getTenantPda(authority)` | Derive tenant PDA |

### `MatchmakingPlayer`

**Constructor:** `new MatchmakingPlayer(rpc, signer, programId?)`

| Method | Description |
|---|---|
| `enterQueue(tenant, queue, playerData, teeRpc, teeUrlWithToken, validator?, callbackProgram?)` | High-level: create ticket → set up Permission PDA → delegate → join queue |
| `createTicket(tenant)` | Create MatchTicket PDA on L1 |
| `delegateTicket(player, tenant, validator?)` | Delegate ticket to TEE |
| `joinQueue(queue, tenant, playerData, callbackProgram?)` | Join queue in TEE; callback fires via Tenant PDA on match |
| `cancelTicket(tenant)` | Cancel search (sets ticket to Cancelled) |
| `closeTicket(tenant)` | Reclaim rent after match or cancel |
| `pollForMatch(ticketPda, maxAttempts?, pollInterval?)` | Poll L1 until ticket is Matched |
| `getTicket(ticketPda)` | Fetch ticket account |
| `withRpc(teeUrl)` | Return a new client pointing at a different RPC |

### `getAuthToken(rpcUrl, signer)`

Authenticate with the MagicBlock TEE. Returns `{ token, expiresAt }`. The token is passed as `?token=<jwt>` in the TEE RPC URL.

### `waitForPermission(teeUrlWithToken, accountAddress, timeoutMs?)`

Poll the TEE until the Permission PDA for `accountAddress` is active (i.e. TEE has picked up the delegated ACL). Returns `true` if confirmed within `timeoutMs` (default 10s), `false` on timeout. Useful after `delegateQueue` if you want to confirm the dark pool is enforced before sending players in.

## Privacy Model

Queue and ticket state is enforced at the **TEE RPC layer** by Permission PDAs:

- **Queue** — only the queue authority's auth token can call `getAccountInfo` on the queue. Other authenticated wallets receive `null` (account not found).
- **Tickets** — only the ticket owner and queue authority can read a ticket on TEE. Third parties read the committed L1 ticket after `resolveMatches`.

This is enforced by the `ACLseo` permission program (`ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1`). Both `delegateQueue` and `enterQueue` set up these Permission PDAs automatically before delegating to TEE.

## How the Callback Works

When a match is found during `join_queue`, the duel program fires a CPI callback **signed by the Tenant PDA** via `invoke_signed`. This is cryptographically unforgeable — game programs can verify the signer is the Tenant PDA without any additional access control:

```rust
pub fn on_match_found(
    ctx: Context<OnMatchFound>,
    player1: Pubkey,
    player2: Pubkey,
    match_id: u64,
) -> Result<()> {
    // ctx.accounts.signer.key() == Tenant PDA — verified by the runtime
    // Only the duel program can produce this signer
    Ok(())
}

#[derive(Accounts)]
pub struct OnMatchFound<'info> {
    pub signer: Signer<'info>, // will be the Tenant PDA
}
```

Pass the callback program as `remaining_accounts` in `joinQueue` (or via `callbackProgram` param in the SDK) for the callback to fire.

## ELO Data Types

| Type | Bytes | Range |
|---|---|---|
| `"u8"` | 1 | 0–255 |
| `"u16"` | 2 | 0–65,535 |
| `"u32"` | 4 | 0–4,294,967,295 |
| `"u64"` | 8 | 0–18,446,744,073,709,551,615 |

## License

MIT

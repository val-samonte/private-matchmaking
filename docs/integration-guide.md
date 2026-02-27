# Duel SDK — Game Developer Integration Guide

This guide walks you through integrating the **Duel** matchmaking protocol into your Solana game from scratch. By the end, your players will be able to enter a private, ELO-based matchmaking queue and receive verified match results on L1.

---

## How It Works (Overview)

```
Game Owner (one-time)           Player                        Game Owner (crank)
─────────────────────           ──────────────────────────    ──────────────────
initializeTenant          →     getAuthToken (TEE)
initializeQueue           →     delegate player profile
delegateQueue (dark pool) →     enterQueue ──────────────→    resolveMatches
                                  ↳ createTicket (L1)              ↳ flushMatches (TEE)
                                  ↳ setup Permission PDA            ↳ commitTickets (L1)
                                  ↳ delegateTicket (TEE)
                                  ↳ joinQueue (TEE)         →     Players poll L1 for Matched status
                                                            →     startGameWithTicket (verify match)
```

- **Tenant** — your game's config stored on L1: program ID, ELO layout, callback settings.
- **Queue** — a dark pool on the TEE; players are matched automatically when ELOs are within the configured window. Only the queue authority can read it.
- **MatchTicket** — one PDA per player per tenant; carries status (`Searching → Matched`). Readable on L1 after `resolveMatches`.
- **Callback** — when a match is found, the duel program fires a CPI to your game program signed by the Tenant PDA. Optional but useful for real-time notifications on TEE.

---

## Prerequisites

- A deployed Anchor program (your game) on Solana devnet
- A player account struct with an ELO field (any integer type)
- A funded authority keypair (for gas on tenant/queue setup)
- Node.js project with `@1upmonster/duel` and `@solana/kit` installed

```bash
npm install @1upmonster/duel @solana/kit
```

---

## Step 1 — Design Your Player Account

The Duel protocol reads ELO directly from your player account's raw bytes. You need to know:

1. The **byte offset** of the ELO field (counting from byte 0 of the account data)
2. The **data type** of the ELO field (`u8`, `u16`, `u32`, or `u64`)

For an Anchor account the first 8 bytes are always the discriminator:

```rust
// Example player account
#[account]
pub struct PlayerProfile {
    pub player: Pubkey,  // bytes 8–39  (32 bytes)
    pub elo:    u64,     // bytes 40–47  ← eloOffset = 40, eloDataType = "u64"
    pub wins:   u64,     // bytes 48–55
}
```

**Formula:** `eloOffset = 8 (discriminator) + sum of bytes of all fields before elo`

Common field sizes: `Pubkey` = 32, `u64` = 8, `u32` = 4, `u16` = 2, `u8` = 1, `bool` = 1.

---

## Step 2 — Add the Callback to Your Anchor Program (Optional)

If you want real-time notification when a match is found (fires in TEE), add this to your Anchor program. The signer is the Tenant PDA — cryptographically unforgeable.

```rust
use anchor_lang::prelude::*;

// In your #[program] module:
pub fn on_match_found(
    ctx: Context<OnMatchFound>,
    player1: Pubkey,
    player2: Pubkey,
    match_id: u64,
) -> Result<()> {
    // ctx.accounts.signer.key() == Tenant PDA — verified by runtime
    msg!("Match found: {} vs {} (id: {})", player1, player2, match_id);
    // You can create a game session account here, emit an event, etc.
    Ok(())
}

#[derive(Accounts)]
pub struct OnMatchFound<'info> {
    pub signer: Signer<'info>, // will be the Tenant PDA — only duel program can produce this
}
```

The Anchor discriminator for this instruction is derived from `"global:on_match_found"`:

```ts
import * as crypto from "crypto";

const callbackDiscriminator = Array.from(
  crypto.createHash("sha256").update("global:on_match_found").digest().slice(0, 8)
);
```

If your callback instruction has a different name, adjust the string accordingly (e.g. `"global:match_callback"`).

> **Note:** The callback runs inside the TEE as part of the `joinQueue` transaction. Any error from the callback propagates and fails the entire match. Keep it lightweight.

---

## Step 3 — One-Time Setup: Tenant & Queue

Run this once to initialize your matchmaking configuration on devnet. The authority keypair controls the queue and is the only wallet that can read it on the TEE.

```ts
import { MatchmakingAdmin, getAuthToken, waitForPermission } from "@1upmonster/duel";
import { createSolanaRpc, createKeyPairSignerFromBytes } from "@solana/kit";
import * as crypto from "crypto";
import { readFileSync } from "fs";

const DUEL_PROGRAM_ID  = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X";
const YOUR_PROGRAM_ID  = "YOUR_GAME_PROGRAM_ID";
const ER_VALIDATOR     = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA";
const TEE_URL          = "https://tee.magicblock.app";

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const authorityBytes = new Uint8Array(JSON.parse(readFileSync("authority.json", "utf-8")));
const authority = await createKeyPairSignerFromBytes(authorityBytes);

const admin = new MatchmakingAdmin(rpc, authority, DUEL_PROGRAM_ID);

// 1. Tenant — stores your game's ELO config and optional callback
const callbackDiscriminator = Array.from(
  crypto.createHash("sha256").update("global:on_match_found").digest().slice(0, 8)
);
await admin.initializeTenant(YOUR_PROGRAM_ID, {
  eloOffset:             40,          // byte offset of ELO in your player account
  eloDataType:           "u64",       // u8 | u16 | u32 | u64
  eloWindow:             100n,        // max ELO difference for a match
  callbackProgramId:     YOUR_PROGRAM_ID,     // omit or set null if no callback
  callbackDiscriminator: callbackDiscriminator, // omit or set null if no callback
});

// 2. Queue — linked to the tenant
const tenantPda = await admin.getTenantPda(authority.address);
await admin.initializeQueue(authority.address, tenantPda);

// 3. Delegate queue to TEE — sets up Permission PDA (dark pool) + DELeGG delegation
await admin.delegateQueue(authority.address, ER_VALIDATOR);

// Optional: confirm the queue ACL is live before sending players in
const { token } = await getAuthToken(TEE_URL, authority);
const active = await waitForPermission(`${TEE_URL}?token=${token}`, queuePda, 15000);
console.log("Queue dark pool active:", active);
```

**Save the following addresses** — you'll need them in your frontend/backend:

```ts
const tenantPda = await admin.getTenantPda(authority.address);
const queuePda  = await admin.getQueuePda(authority.address);
console.log("Tenant PDA:", tenantPda);
console.log("Queue PDA: ", queuePda);
```

---

## Step 4 — Prepare the Player Account (Rust)

Before a player can join the queue, their player account must exist and be **delegated to the TEE**. In the `rps-game` example this is done via a `delegate_pda` instruction:

```rust
// In your Anchor program — delegate any PDA to TEE
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub validator: Option<AccountInfo<'info>>,
}

pub fn delegate_pda(ctx: Context<DelegatePda>, seeds: Vec<Vec<u8>>) -> Result<()> {
    let seeds_refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
    ctx.accounts.delegate_pda(
        &ctx.accounts.payer,
        &seeds_refs,
        DelegateConfig { validator, ..Default::default() },
    )?;
    Ok(())
}
```

Add `ephemeral_rollups_sdk` to your `Cargo.toml`:

```toml
[dependencies]
ephemeral_rollups_sdk = { version = "0.3", features = ["anchor"] }
```

And mark your program module with `#[ephemeral]`:

```rust
#[ephemeral]
#[program]
pub mod your_game {
    // ...
}
```

---

## Step 5 — Player Enters the Queue (Frontend / SDK)

```ts
import { MatchmakingPlayer, getAuthToken } from "@1upmonster/duel";
import { createSolanaRpc, createKeyPairSignerFromBytes } from "@solana/kit";

const DUEL_PROGRAM_ID = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X";
const ER_VALIDATOR    = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA";
const TEE_URL         = "https://tee.magicblock.app";

const l1Rpc = createSolanaRpc("https://api.devnet.solana.com");

// These come from Step 3
const TENANT_PDA = "...";
const QUEUE_PDA  = "...";

// Player's keypair / wallet (from wallet adapter in production)
const player = /* KeyPairSigner or wallet adapter */;

// 1. Authenticate with TEE
const { token } = await getAuthToken(TEE_URL, player);
const teeRpc = createSolanaRpc(`${TEE_URL}?token=${token}`);

// 2. Derive the player profile PDA (your game's account)
const playerProfilePda = /* derive your game's player account PDA */;

// 3. Enter queue — one call handles everything:
//    createTicket → setup Permission PDA → delegate → joinQueue on TEE
const client = new MatchmakingPlayer(l1Rpc, player, DUEL_PROGRAM_ID);
const ticketPda = await client.enterQueue(
  TENANT_PDA,
  QUEUE_PDA,
  playerProfilePda,          // your game's player data account (for ELO read)
  teeRpc,
  `${TEE_URL}?token=${token}`,
  ER_VALIDATOR,
  YOUR_PROGRAM_ID,           // optional: omit if no callback
);

console.log("In queue. Ticket PDA:", ticketPda);
```

`enterQueue` is fully atomic from the player's perspective — they sign ~5 transactions in sequence. Each transaction is confirmed before the next starts.

---

## Step 6 — Poll for a Match (Frontend / SDK)

After entering the queue the player waits. **Poll L1** for the ticket status to change to `Matched`. This happens after the game owner runs `resolveMatches` (Step 7).

```ts
// Poll until matched (checks L1 every 2 seconds, up to 2 minutes)
const match = await client.pollForMatch(ticketPda);

if (match) {
  console.log("Matched! Opponent:", match.opponent);
  console.log("Match ID:", match.matchId);
} else {
  console.log("Timed out — still searching");
}
```

---

## Step 7 — Resolve Matches (Game Owner Crank)

This step is run by the **game owner** (or a permissionless crank service) after matches are made on the TEE. It flushes pending opponent ticket updates and commits both tickets back to L1 so players can see their results.

```ts
import { MatchmakingAdmin, getAuthToken } from "@1upmonster/duel";
import { createSolanaRpc } from "@solana/kit";

const { token } = await getAuthToken(TEE_URL, authority);
const teeRpc = createSolanaRpc(`${TEE_URL}?token=${token}`);
const adminTee = new MatchmakingAdmin(teeRpc, authority, DUEL_PROGRAM_ID);

// Pass all ticket PDAs that participated in this match cycle
await adminTee.resolveMatches(QUEUE_PDA, TENANT_PDA, [p1TicketPda, p2TicketPda]);
```

After `resolveMatches` completes (typically ~6–10 seconds for L1 confirmation), both players' tickets on L1 will show `{ __kind: "Matched", opponent: "...", matchId: N }`.

**How to derive ticket PDAs for players you don't know in advance:**

```ts
const queue = await adminTee.getQueue(QUEUE_PDA);

// Pending matches accumulate while queue was live
// resolveMatches reads them automatically — just pass all ticket PDAs you know
const ticketPdas = await Promise.all(
  knownPlayerAddresses.map(player => admin.getTicketPda(player, TENANT_PDA))
);
await adminTee.resolveMatches(QUEUE_PDA, TENANT_PDA, ticketPdas);
```

---

## Step 8 — Start the Game (Verify Match via Ticket)

Players can use their L1 ticket as proof of a legitimate match. The `start_game_with_ticket` pattern reads the ticket account directly and verifies the status is `Matched` with the claimed opponent:

```rust
pub fn start_game_with_ticket(
    ctx: Context<StartGameWithTicket>,
    game_id: u64,
    opponent: Pubkey,
) -> Result<()> {
    // Read ticket status directly from raw account data
    let ticket_data = ctx.accounts.match_ticket.try_borrow_data()?;
    // Byte layout: [discriminator(8)] [player(32)] [tenant(32)] [status...]
    // status at byte 72: 0=Searching, 1=Matched, 2=Expired, 3=Cancelled
    require!(ticket_data.len() > 72, GameError::InvalidMatchTicket);
    require!(ticket_data[72] == 1, GameError::InvalidMatchTicket); // Must be Matched

    // Opponent is encoded at bytes 73..105 in Matched status
    let mut opponent_bytes = [0u8; 32];
    opponent_bytes.copy_from_slice(&ticket_data[73..105]);
    require!(Pubkey::from(opponent_bytes) == opponent, GameError::InvalidMatchTicket);
    drop(ticket_data);

    let session = &mut ctx.accounts.game_session;
    session.player1 = ctx.accounts.player.key();
    session.player2 = opponent;
    session.game_id = game_id;
    // ...
    Ok(())
}
```

This gives you **trustless match verification** — no oracle or backend required.

---

## Step 9 — Cancel & Cleanup

A player can cancel search while still in `Searching` status (runs on TEE):

```ts
await client.cancelTicket(TENANT_PDA);
```

After the match is consumed (or cancelled/expired), reclaim rent on L1:

```ts
await client.closeTicket(TENANT_PDA);
```

---

## Reference: PDA Derivations

All PDAs use the Duel program ID (`EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X`) unless noted.

| Account | Seeds | Program |
|---|---|---|
| Tenant | `["tenant", authority]` | Duel |
| Queue | `["queue", authority]` | Duel |
| MatchTicket | `["ticket", player, tenantPda]` | Duel |
| Permission (queue) | `["permission:", queuePda]` | `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` |
| Permission (ticket) | `["permission:", ticketPda]` | `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` |

```ts
import { utils } from "@1upmonster/duel";

const tenantPda  = await utils.deriveTenantPda(DUEL_PROGRAM_ID, authority.address);
const queuePda   = await utils.deriveQueuePda(DUEL_PROGRAM_ID, authority.address);
const ticketPda  = await utils.deriveTicketPda(DUEL_PROGRAM_ID, player.address, tenantPda);
```

---

## Reference: MatchTicket Byte Layout

Useful for reading ticket status in Rust without an Anchor dependency:

```
Offset  Size  Field
──────  ────  ─────────────────────────────────────────
0       8     Anchor discriminator
8       32    player (Pubkey)
40      32    tenant (Pubkey)
72      1     status discriminant: 0=Searching 1=Matched 2=Expired 3=Cancelled
── if Matched (discriminant == 1):
73      32    opponent (Pubkey)
105     8     match_id (u64, little-endian)
──
113     8     created_at (i64, little-endian)
121     1     bump (u8)
```

---

## Reference: Constants

| Constant | Value |
|---|---|
| Duel Program | `EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X` |
| TEE RPC | `https://tee.magicblock.app` |
| ER Validator | `FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA` |
| Permission Program | `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` |
| DELeGG Program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |

---

## Common Issues

**`InvalidTenant` error on `joinQueue`**
The player data account is not owned by your game program. Make sure the player's profile account exists and belongs to the program ID you registered in `initializeTenant`.

**`InvalidTicketStatus` on `joinQueue`**
The player's ticket is not in `Searching` status. They may have a leftover ticket from a previous session — call `closeTicket` first to reclaim rent, then `enterQueue` again.

**`AccountOwnedByWrongProgram` on `delegateQueue`**
The queue is already delegated from a previous run. Each queue can only be delegated once. Create a new authority keypair (and therefore new Tenant + Queue PDAs) for fresh testing.

**Player profile not found on TEE after delegation**
DELeGG delegation takes effect within seconds of L1 confirmation. If `joinQueue` fails immediately after `delegateTicket`, add a short wait (~2s) or retry once.

**Snooper can read queue**
The Permission PDA must be delegated before the queue is used. The `delegateQueue` SDK method handles this automatically. If you are calling the program instructions manually, follow the order: `setup_queue_permission` → `DelegatePermission` → `delegate_queue`.

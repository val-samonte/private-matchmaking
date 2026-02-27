# Duel — Private Matchmaking Protocol for Solana

A privacy-preserving, ELO-based matchmaking protocol built on Solana using [MagicBlock Ephemeral Rollups (TEE)](https://docs.magicblock.gg). Players are matched in a dark pool — the queue state is hidden from both L1 observers and unauthorized TEE users. Match results are settled on-chain and verifiable by anyone.

**SDK:** [`@1upmonster/duel`](https://www.npmjs.com/package/@1upmonster/duel) on npm.

---

## What's Inside

| Path | Contents |
|---|---|
| `programs/duel/` | Core matchmaking protocol (Anchor) |
| `programs/rps-game/` | Reference game — Rock Paper Scissors |
| `sdk/` | TypeScript SDK (`@1upmonster/duel`) |
| `tests/` | End-to-end integration tests |
| `docs/integration-guide.md` | **Step-by-step guide for game developers** |

---

## How It Works

```
Game Owner           Player                          Game Owner (crank)
────────────         ─────────────────────────────   ──────────────────
initializeTenant     getAuthToken (TEE)
initializeQueue      delegate player account
delegateQueue   →    enterQueue ──────────────────→  resolveMatches
(dark pool)            createTicket (L1)               flushMatches (TEE)
                       setup Permission PDA            commitTickets (L1)
                       delegateTicket (TEE)         →  poll L1 for Matched
                       joinQueue (TEE)
```

- **Tenant** — your game's config: program ID, ELO layout, optional callback.
- **Queue** — a TEE dark pool. Unauthorized wallets get `null` on `getAccountInfo`. Only the queue authority can read it.
- **MatchTicket** — one PDA per player; carries `Searching → Matched` status. Committed to L1 after `resolveMatches`.
- **Callback** — when a match is found, the duel program CPIs your game signed by the Tenant PDA (unforgeable).

---

## Quick Start (SDK)

```bash
npm install @1upmonster/duel @solana/kit
```

### Game Owner Setup (one-time)

```ts
import { MatchmakingAdmin, getAuthToken } from "@1upmonster/duel";
import { createSolanaRpc, createKeyPairSignerFromBytes } from "@solana/kit";
import * as crypto from "crypto";

const rpc       = createSolanaRpc("https://api.devnet.solana.com");
const authority = await createKeyPairSignerFromBytes(/* your keypair bytes */);
const admin     = new MatchmakingAdmin(rpc, authority);

const callbackDiscriminator = Array.from(
  crypto.createHash("sha256").update("global:on_match_found").digest().slice(0, 8)
);

await admin.initializeTenant(YOUR_GAME_PROGRAM_ID, {
  eloOffset:             40,      // byte offset of ELO in your player account
  eloDataType:           "u64",   // u8 | u16 | u32 | u64
  eloWindow:             100n,    // max ELO diff to match
  callbackProgramId:     YOUR_GAME_PROGRAM_ID,
  callbackDiscriminator,
});

const tenantPda = await admin.getTenantPda(authority.address);
await admin.initializeQueue(authority.address, tenantPda);
await admin.delegateQueue(authority.address, ER_VALIDATOR); // sets up dark pool + delegates
```

### Player Flow

```ts
import { MatchmakingPlayer, getAuthToken } from "@1upmonster/duel";
import { createSolanaRpc } from "@solana/kit";

const l1Rpc = createSolanaRpc("https://api.devnet.solana.com");
const { token } = await getAuthToken("https://tee.magicblock.app", player);
const teeRpc  = createSolanaRpc(`https://tee.magicblock.app?token=${token}`);

const client    = new MatchmakingPlayer(l1Rpc, player);
const ticketPda = await client.enterQueue(
  TENANT_PDA, QUEUE_PDA, playerProfilePda,
  teeRpc, `https://tee.magicblock.app?token=${token}`,
  ER_VALIDATOR, YOUR_GAME_PROGRAM_ID,
);

// Poll L1 after resolveMatches runs
const match = await client.pollForMatch(ticketPda);
// → { opponent: Address, matchId: bigint }
```

### Match Resolution (crank)

```ts
const { token } = await getAuthToken("https://tee.magicblock.app", authority);
const teeRpc    = createSolanaRpc(`https://tee.magicblock.app?token=${token}`);
const adminTee  = new MatchmakingAdmin(teeRpc, authority);

await adminTee.resolveMatches(QUEUE_PDA, TENANT_PDA, [p1TicketPda, p2TicketPda]);
```

---

## For Game Developers

See **[`docs/integration-guide.md`](docs/integration-guide.md)** for the full step-by-step guide covering:

- ELO byte offset calculation
- Adding the callback to your Anchor program
- Tenant and queue initialization
- Player account delegation
- Entering the queue and polling for matches
- Match verification via MatchTicket (trustless, no oracle)
- PDA derivation reference and byte layout

---

## Development

### Prerequisites

- [Solana Tool Suite](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor Framework](https://www.anchor-lang.com/) v0.32.1+
- Node.js v18+

### Setup

```bash
git clone https://github.com/val-samonte/private-matchmaking.git
cd private-matchmaking
yarn install
cd sdk && npm install && cd ..
```

### Build Programs

```bash
anchor build
```

### Run Tests

```bash
npx tsx node_modules/.bin/_mocha --timeout 1000000 tests/auto-match.ts tests/callback.ts
```

Tests cover the full flow end-to-end against devnet and the live TEE. Requires a funded wallet at `~/.config/solana/id.json`.

### Build SDK

```bash
cd sdk && npm run build
```

---

## Repository Structure

```
.
├── programs/
│   ├── duel/              # Core matchmaking protocol
│   │   └── src/lib.rs
│   └── rps-game/          # Reference game (Rock Paper Scissors)
│       └── src/lib.rs
├── sdk/                   # @1upmonster/duel — published to npm
│   ├── src/
│   │   ├── admin.ts       # MatchmakingAdmin (game owner)
│   │   ├── player.ts      # MatchmakingPlayer (player)
│   │   ├── tee.ts         # getAuthToken, waitForPermission
│   │   ├── utils.ts       # PDA derivation helpers
│   │   └── generated/     # Codama-generated program clients
│   └── package.json
├── tests/
│   ├── auto-match.ts      # Full matchmaking + game flow (8 tests)
│   └── callback.ts        # CPI callback via Tenant PDA (4 tests)
├── docs/
│   └── integration-guide.md   # Game developer integration guide
└── Anchor.toml
```

---

## License

MIT

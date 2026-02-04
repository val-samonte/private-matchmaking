# @1upmonster/duel

TypeScript SDK for **Duel** - a privacy-focused matchmaking protocol on Solana using MagicBlock's Ephemeral Rollups (TEE).

## Features

- **Privacy-First**: Player ELO and queue status hidden in TEE
- **Client-Side**: Players join queues directly from their wallets (no CPI required)
- **Automatic Matching**: TEE processes matches based on ELO windows
- **Easy Integration**: Simple SDK for both game owners and players

## Installation

```bash
npm install @1upmonster/duel
```

## Quick Start

### For Game Owners

Initialize matchmaking infrastructure for your game:

```typescript
import { MatchmakingAdmin } from "@1upmonster/duel";
import { AnchorProvider } from "@coral-xyz/anchor";

const admin = new MatchmakingAdmin(provider);

// 1. Initialize Tenant for your Game Program
// Args: authority, tenantProgramId, eloWindow (default 100), eloOffset (default 40)
await admin.initializeTenant(authority, gameProgramId, 200, 40);

// 2. Initialize a Matchmaking Queue
const tenantPda = admin.getTenantPda(authority);
await admin.initializeQueue(authority, tenantPda);

// 3. Delegate Queue to TEE Validator
await admin.delegateQueue(authority, validatorPubkey);
```

### For Players

Join the private matchmaking queue:

```typescript
import { MatchmakingPlayer } from "@1upmonster/duel";

const player = new MatchmakingPlayer(provider);

// Join queue (matching happens automatically in TEE)
await player.joinQueue(queuePda, tenantPda, playerProfilePda);
```

## API Reference

### `MatchmakingAdmin`

**Constructor**
- `new MatchmakingAdmin(provider: AnchorProvider, programId?: PublicKey)`

**Methods**
- `initializeTenant(authority, tenantProgramId, eloWindow?, eloOffset?)` - Set up game tenant
- `initializeQueue(authority, tenant)` - Create matchmaking queue
- `delegateQueue(authority, validator?)` - Delegate to TEE validator
- `getTenantPda(authority)` - Derive tenant PDA
- `getQueuePda(authority)` - Derive queue PDA

### `MatchmakingPlayer`

**Constructor**
- `new MatchmakingPlayer(provider: AnchorProvider, programId?: PublicKey)`

**Methods**
- `joinQueue(queue, tenant, playerData)` - Join matchmaking queue

## How It Works

1. **Queue Joining**: Players call `joinQueue` directly via SDK
2. **Matching**: TEE automatically processes matches based on ELO windows
3. **Privacy**: Queue state is only visible within the TEE, not on L1

## Links

- [GitHub Repository](https://github.com/val-samonte/private-matchmaking)
- [Full Documentation](https://github.com/val-samonte/private-matchmaking#readme)

## License

MIT

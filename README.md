# Duel - Private Matchmaking on Solana

A complete privacy-focused matchmaking protocol built on Solana using MagicBlock's Ephemeral Rollups (TEE). This repository contains the on-chain programs, TypeScript SDK, and reference game implementation.

## What's Inside

This is a **monorepo** containing:

1. **Anchor Programs** (`programs/`)
   - `duel`: Core matchmaking protocol with TEE privacy
   - `rps-game`: Reference Rock-Paper-Scissors game implementation
   
2. **TypeScript SDK** (`sdk/`)
   - Published as `@1upmonster/duel` on NPM
   - Client library for game owners and players
   
3. **Integration Tests** (`tests/`)
   - Full end-to-end test suite demonstrating the complete flow

## Features

*   **Privacy-First:** Player ELO and queue status are hidden within a Trusted Execution Environment (TEE)
*   **Client-Side Joining:** Players join queues directly from their wallets (no CPI required)
*   **Automatic Matching:** TEE processes matches based on configurable ELO windows
*   **Provable Fairness:** Matches are processed securely off-chain, with results settled on-chain
*   **Game Agnostic:** Designed to work with any game program

## Architecture

### Programs

1.  **Duel Program (`programs/duel`)**: The core matchmaking logic. It manages Tenants (game developers) and Queues. It runs as an Ephemeral Rollup for privacy.
2.  **RPS Game (`programs/rps-game`)**: A reference implementation of a game using Duel. It demonstrates how a game program validates matched players and handles results.

### SDK

3.  **SDK (`@1upmonster/duel`)**: A TypeScript client SDK that allows players to join queues directly from their wallets (no CPI required).

### How It Works

1.  **Queue Joining**: Players use the client SDK to join queues directly - no game program involvement needed
2.  **Matching**: The TEE automatically processes matches based on ELO windows
3.  **Game Integration**: Once matched, players interact with the game program (e.g., RPS Game)

## Prerequisites

*   [Solana Tool Suite](https://docs.solana.com/cli/install-solana-cli-tools)
*   [Anchor Framework](https://www.anchor-lang.com/) v0.32.1+
*   [Node.js](https://nodejs.org/) v16+ & [Yarn](https://yarnpkg.com/)

## Development Setup

### 1. Clone and Install

```bash
git clone https://github.com/val-samonte/private-matchmaking.git
cd private-matchmaking
yarn install
cd sdk && npm install && cd ..
```

### 2. Build Programs

```bash
anchor build
```

This compiles both the `duel` and `rps-game` programs.

### 3. Run Tests

```bash
anchor test
```

The test suite demonstrates:
- Tenant and queue initialization
- TEE delegation
- Player queue joining (client-side)
- Automatic matching in TEE
- Game session creation and play
- Privacy verification (L1 vs TEE visibility)

### 4. Build SDK

```bash
cd sdk
npm run build
```

## Using the SDK

### Installation

```bash
npm install @1upmonster/duel
```

### For Game Owners

```typescript
import { MatchmakingAdmin } from "@1upmonster/duel";

const admin = new MatchmakingAdmin(provider);

// 1. Initialize Tenant for your Game Program
await admin.initializeTenant(gameProgramId, {
  authority,      // optional, defaults to gameProgramId
  eloWindow: 200, // optional, default 100
  eloOffset: 40,  // optional, default 40
  eloDataType: 'u16' // optional, default 'u16' (u8/u16/u32/u64)
});

// 2. Initialize a Matchmaking Queue
await admin.initializeQueue(authority, tenantPda);

// 3. Delegate Queue to a TEE Validator
await admin.delegateQueue(authority, validatorPubkey);
```

### For Players

```typescript
import { MatchmakingPlayer } from "@1upmonster/duel";

const player = new MatchmakingPlayer(provider);

// Join the private queue
// Note: Actual matching happens automatically inside the TEE
await player.joinQueue(queuePda, tenantPda, playerProfilePda);
```

## Repository Structure

```
.
├── programs/
│   ├── duel/              # Core matchmaking program
│   │   ├── src/lib.rs     # Main program logic
│   │   └── Cargo.toml
│   └── rps-game/          # Reference game implementation
│       ├── src/lib.rs
│       └── Cargo.toml
├── sdk/                   # TypeScript SDK (@1upmonster/duel)
│   ├── src/
│   │   ├── admin.ts       # Admin/owner functionality
│   │   ├── player.ts      # Player functionality
│   │   └── types.ts       # Generated types
│   └── package.json
├── tests/
│   └── auto-match.ts      # Integration tests
├── Anchor.toml            # Anchor configuration
└── README.md              # This file
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)


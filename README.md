# Duel - Private Matchmaking on Solana

**Duel** (formerly Private Matchmaking) is a privacy-focused matchmaking protocol built on Solana using MagicBlock's Ephemeral Rollups (TEE). It allows players to queue for games without revealing their ELO or intentions to the public chain until a match is found.

## Features

*   **Privacy-First:** Player ELO and queue status are hidden within a Trusted Execution Environment (TEE).
*   **Provable Fairness:** Matches are processed securely off-chain, with results settled on-chain.
*   **Delegated Authority:** Game owners delegate matchmaking to verified TEE validators.
*   **Cross-Program Integration:** Designed to work with arbitrary game programs (e.g., Rock Paper Scissors).

## Architecture

The project consists of three main components:

1.  **Duel Program (`programs/duel`)**: The core matchmaking logic. It manages Tenants (game developers) and Queues. It runs as an Ephemeral Rollup for privacy.
2.  **RPS Game (`programs/rps-game`)**: A reference implementation of a game using Duel. It demonstrates Cross-Program Invocation (CPI) to the matchmaking system.
3.  **SDK (`@1upmonster/duel`)**: A TypeScript client for developers to integrate matchmaking into their applications.

## Prerequisities

*   [Solana Tool Suite](https://docs.solana.com/cli/install-solana-cli-tools)
*   [Anchor Framework](https://www.anchor-lang.com/)
*   [Node.js](https://nodejs.org/) & [Yarn](https://yarnpkg.com/)

## Installation

### SDK
To use the SDK in your client application:

```bash
npm install @1upmonster/duel
```

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/val-samonte/private-matchmaking.git
    cd private-matchmaking
    ```

2.  **Install dependencies:**
    ```bash
    yarn install
    cd sdk && npm install
    ```

3.  **Build the programs:**
    ```bash
    anchor build
    ```

4.  **Run Tests:**
    ```bash
    anchor test
    ```

## Usage (SDK)

The SDK provides two main classes for interaction.

### for Game Owners (`MatchmakingAdmin`)

Initialize your game's matchmaking infrastructure.

```typescript
import { MatchmakingAdmin } from "@1upmonster/duel";

const admin = new MatchmakingAdmin(provider, programId);

// 1. Initialize Tenant for your Game Program
await admin.initializeTenant(authority, gameProgramId);

// 2. Initialize a Matchmaking Queue
await admin.initializeQueue(authority, tenantPda);

// 3. Delegate Queue to a TEE Validator
await admin.delegateQueue(authority, validatorPubkey);
```

### for Players (`MatchmakingPlayer`)

Allow players to join the private queue.

```typescript
import { MatchmakingPlayer } from "@1upmonster/duel";

const player = new MatchmakingPlayer(provider, programId);

// Join the private queue
// Note: Actual matching happens automatically inside the TEE
await player.joinQueue(queuePda, tenantPda, playerProfilePda);
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)

# Rock Paper Scissors (On-Chain + TEE): Technical Whitepaper

## 1. Executive Summary
**Rock Paper Scissors** is a reference implementation of a **Privacy-First Game** built on Solana. It demonstrates how to utilize the Private Matchmaking Protocol to transition players from a "Dark Pool" queue into a secure, Peer-to-Peer (P2P) game session where moves are hidden until the reveal phase.

## 2. Game Mechanics

### 2.1 The Flow
1.  **Registration**: Player creates an On-Chain Profile (`PlayerProfile`) initialized with ELO 1200.
2.  **Queueing**: Player joins the private matchmaking queue.
3.  **Handoff**: Upon matching, players receive a `GameID`.
4.  **Connect**: Both players call `join_session(GameID)`. This symmetric instruction replaces the traditional "Host/Join" model.
5.  **Commit**: Players submit their move (Rock, Paper, or Scissors) encrypted to the TEE.
6.  **Reveal**: Once both commits are detected, the result is computed, ELO is updated, and the winner is revealed atomically.

## 3. Architecture

### 3.1 Data Structures
-   **PlayerProfile**: Stores ELO, Wins, Losses. Owned by the Game Program.
-   **Game**: Stores `[Player1, Player2, Choice1, Choice2, Result]`.
-   **PlayerChoice**: A PDA derived from `[GameID, Player]`. Stores the individual hidden move.

### 3.2 Peer-to-Peer Session Logic
The `join_session` instruction is **idempotent**:
```rust
pub fn join_session(ctx, game_id) {
    if game.player1 == None { assign player1 }
    else if game.player2 == None { assign player2 }
}
```
This ensures that neither player has a special "Host" privilege. The order of arrival on-chain determines the slot assignment (Player 1 vs Player 2).

### 3.3 Privacy Implementation (TEE)
The game leverages Ephemeral Rollups to process moves privately.
-   **Commit Phase**: When `make_choice` is called, the transaction data (containing the move) is encrypted for the TEE. The `PlayerChoice` account in the TEE is updated, but on L1, observers only see "State Updated".
-   **Reveal Phase**: The `reveal_winner` instruction runs inside the TEE:
    1.  Reads both privately stored choices.
    2.  Computes the winner.
    3.  Updates public ELO.
    4.  Unlocks the players from the Matchmaking Queue (invoking `unlock_player` via CPI).

## 4. Integration with Matchmaker
The RPS program acts as a **Tenant** to the Matchmaking infrastructure.
-   It provides the `PlayerProfile` account which the matchmaker reads (ELO offset + size check).
-   It delegates the Queue authority to the Matchmaker during initialization.
-   It accepts CPI calls from the Matchmaker to lock/unlock players.

## 5. Deployment strategy
This reference game is designed to be deployed with:
-   **Program A (RPS)**: The verified game logic.
-   **Program B (Matchmaker)**: The generic infrastructure.
-   **MagicBlock Validator**: The TEE node executing the private instructions.

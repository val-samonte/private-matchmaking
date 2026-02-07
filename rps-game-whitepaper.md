# Rock Paper Scissors (On-Chain + TEE): Technical Whitepaper

## 1. Executive Summary
**Rock Paper Scissors** is a reference implementation of a **Privacy-First Game** built on Solana. It demonstrates how to utilize the Private Matchmaking Protocol to transition players from a "Dark Pool" queue into a secure, Peer-to-Peer (P2P) game session where moves are hidden until the reveal phase.

## 2. Game Mechanics

### 2.1 The Flow
1.  **Registration**: Player creates an On-Chain Profile (`PlayerProfile`) initialized with ELO 1200.
2.  **Ticket Creation**: Player creates a `MatchTicket` on L1 and delegates it to the TEE.
3.  **Queueing**: Player joins the private matchmaking queue inside the TEE using their delegated ticket.
4.  **Auto-Match**: The TEE matches players and updates their tickets. Results are committed back to L1.
5.  **Connect**: Players call `start_game_with_ticket(GameID)`, proving to the game program that a valid match occurred.
6.  **Commit**: Players submit their move (Rock, Paper, or Scissors) encrypted to the TEE.
7.  **Reveal**: Result is computed in TEE, ELO is updated, and results are persisted to L1.

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
The game leverages **Ephemeral Rollups** to process moves and matchmaking privately.
-   **Matchmaking**: The Queue state and Player ELOs are loaded into the TEE. Matching logic runs inside the enclave, updating `MatchTicket` accounts. L1 observers only see "State Updated" or "Ticket Committed" without knowing who matched against whom until the game starts.
-   **Game Play**:
    -   **Commit Phase**: Moves are submitted as encrypted transactions. The `PlayerChoice` account in the TEE is updated.
    -   **Reveal Phase**: The `reveal_winner` (or `persist_results`) instruction runs inside the TEE:
        1.  Reads both privately stored choices.
        2.  Computes the winner.
        3.  Updates public ELO.
        4.  Unlocks the players from the Matchmaking Queue.

## 4. Integration with Matchmaker
The RPS program acts as a **Tenant** to the Matchmaking infrastructure.
-   It provides the `PlayerProfile` account which the matchmaker reads (ELO offset + size check).
-   It delegates the Queue authority to the Matchmaker during initialization.
-   It ensures fair play by requiring `start_game_with_ticket`, which verifies the `MatchTicket` against the `Duel` program before initializing a session.

## 5. Deployment strategy
This reference game is designed to be deployed with:
-   **Program A (RPS)**: The verified game logic.
-   **Program B (Matchmaker)**: The generic infrastructure.
-   **MagicBlock Validator**: The TEE node executing the private instructions.

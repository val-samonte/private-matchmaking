# Improvement 7.2: Strict Data Layout Dependency

## 1. Problem Description
The current matchmaking logic assumes that the Tenant's "Player Game Account" stores the ELO rating at a fixed offset (defined in `QueueConfig`).
```rust
// Current Logic
let val = u64::from_le_bytes(data[offset..offset+8]...);
```
This is brittle. If a Game Developer updates their account struct (e.g., adds a field before ELO), the offset shifts, and the matchmaker starts reading garbage data, potentially breaking the queue.

## 2. Proposed Solution

Abstract the "ELO Provider" logic away from raw byte reading.

### Strategy A: The "Matchable" Trait (Interface)
Define a standard Anchor Instruction Interface that tenants must implement.
-   **Interface**: `get_player_elo(player: Pubkey) -> u64`.
-   **Mechanism**: The Queue Program makes a **Read-Only CPI** to the Tenant Program to ask for the ELO.
-   **Pros**: Perfectly robust. The Tenant controls their data layout.
-   **Cons**: Higher gas cost (CPI overhead). TEE compatibility (CPIs inside TEE are efficient, but require the Tenant Program to also be "callable" or data-accessible).

### Strategy B: Adapter Pattern
Allow the `QueueConfig` to specify a "Adapter Instruction".
-   Instead of reading data directly, the Matchmaker passes the account data to a lightweight "Adapter Program" (provided by the user) which parses it and returns the u64.
-   This allows complex logic (e.g. "Calculate ELO based on Wins/Losses").

## 3. Implementation Plan

### Backend Changes
1.  **Refactor `parse_elo`**: Replace the raw byte slicing with a CPI call to `TenantProgram::get_elo(account)`.
2.  **IDL Update**: Define the `Matchable` interface in the Matchmaking IDL so Tenants can generate conforming instructions.

### Integration Changes
1.  **RPS Game**: Implement the `get_elo` instruction.
2.  **Configuration**: Remove `elo_offset` and `elo_type` from `QueueConfig`, replace with `elo_selector_program` (optional) or just rely on standard interface.

## 4. Work Estimation
-   **Complexity**: High (Cross-Program Architecture change).
-   **Impact**: Medium (Improves robustness, prevents "garbage ELO" bugs).

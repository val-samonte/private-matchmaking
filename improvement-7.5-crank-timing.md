# Improvement 7.5: Hybrid Matching (Instant + Crank)

## 1. Problem Description
We need a matchmaking system that is both **fast** (low latency) and **robust** (handles low liquidity/high gaps).
-   **Pure Crank**: Adds latency. A player joins and waits 10s for the next "tick".
-   **Pure Instant**: If a player joins and no one is there, they might get stuck forever if we don't have a mechanism to "re-check" or "widen criteria" later.

## 2. Proposed Solution: The Hybrid Model

We implement **both** strategies to cover all bases.

### A. Instant Match (on `join_queue`)
When a player calls `join_queue` (or `join_session`), the program doesn't just add them to the list. It performs an **Immediate Scan**:
1.  **Check Buckets**: Look at the `ActivePagesRegistry` (from Imp. 7.4) for pages with players in the matching ELO range.
2.  **Try Match**:
    -   **Success**: If a valid opponent is found, atomic match is created *immediately* in the same transaction. The `join` instruction returns "Match Found" (or emits event).
    -   **Fail**: If no match, the player is appended to the queue (persisted).

**Pros**: 90% of players get matched instantly (O(1) latency).
**Privacy**: This naturally masks "Matching" activity within "Joining" activity.

### B. Safety Crank (The Widening Net)
We keep the periodic `process_match` crank, but its role changes. It is no longer the *primary* matcher. It is the **Cleanup / Widening Agent**.
1.  **Scan Stale Players**: It iterates through players who have been in the queue > `X` seconds.
2.  **Widen Criteria**: For these players, it looks for opponents with a *wider* ELO gap (Linear Expansion: $\Delta ELO = Time \times Factor$).
3.  **Efficiency**: It skips "fresh" players who would have been matched by the Instant logic anyway.

## 3. Implementation Plan

### Dependencies
-   **Improvement 7.4 (Scaling)** is a **HARD PREREQUISITE**. To run matching logic inside `join_queue`, the lookup must be fast (O(1) or O(few)). We cannot iterate 1,000 pages inside a user's transaction.

### Backend Changes
1.  **`join_queue`**:
    -   Accepts `queue` and `page_registry`.
    -   Logic: `let match = try_find_match(registry, player_elo);`
    -   If `match`: `create_match(match)`;
    -   Else: `add_to_queue(player)`;
2.  **`process_match`**:
    -   Logic: `iterate_registry_with_time_filter(now - 30s)`.

## 4. Work Estimation
-   **Complexity**: High (Coordination between two matching paths).
-   **Impact**: Best-in-class UX and Reliability.

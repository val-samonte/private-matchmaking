# Improvement 7.4: Scaling Limits (Page Registry)

## 1. Problem Description
The current implementation uses a "Ring Buffer" concept where pages are linearly linked or indexed.
-   **Limit**: If the queue grows to 1,000 pages, the "Crank" needs to iterate through them to find matches. On Solana, Compute Unit (CU) limits restricting the loop size, meaning "infinite" scalability is actually capped by "processing bandwidth".
-   **Fragmentation**: If Page 1 is empty but Page 100 is full, the crank might waste CUs checking empty pages.

## 2. Proposed Solution
Migrate to a **Page Registry** or **Sparse Index** system.

### Strategy: Active Page Registry
1.  **Registry PDA**: A metadata account that stores a `Bitmask` or `List<PageIndex>` of only the *currently active, non-empty* pages.
2.  **O(1) Access**: The Crank reads the Registry first, gets the list of `[Page 5, Page 12, Page 99]`, and *only* loads those accounts.
3.  **Dynamic Pruning**: When a page becomes empty, it is removed from the Registry.

### Strategy: Sharded Queues
Instead of one giant queue, hash players into `N` Sub-Queues based on ELO buckets (e.g., Bronze Queue, Silver Queue). This parallelizes the matching problem.

## 3. Implementation Plan

### Backend Changes
1.  **New Account**: `ActivePagesRegistry`.
2.  **Update `join_queue`**: Use the Registry to find the "Best Fit" page (one with space) instead of just appending to the tail.
3.  **Update `process_match`**: Iterate *only* the pages listed in the Registry.

## 4. Work Estimation
-   **Complexity**: High (Complex state management).
-   **Impact**: High (Necessary for production-scale games with 10k+ concurrents).

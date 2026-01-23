# Improvement 7.1: Post-Match Privacy (Native Permissions)

## 1. Problem Description
Currently, when a match is made, the `Game` account (or `Match` event) might be visible to the public or the "Crank" if not properly protected. We need to ensure that *only* the two matched players can see their new Game Session details (e.g., the Game ID / PDA).

## 2. Proposed Solution (Updated via Quickstart)
Use the **MagicBlock Access Control (Permissions)** feature available in `ephemeral-rollups-sdk`.

### The Flow
1.  **Match Found**: The TEE (Matchmaking Program) finds two players.
2.  **CPI to Permission Program**: The Matchmaking program calls `UpdatePermission` (via CPI) for the new `Game` account (or the `Match` record).
3.  **Grant Access**: It explicitly sets the `read` permission for `Player1` and `Player2`.
4.  **Deny Others**: All other accounts (including the Crank, if not authorized) are denied read access.

**Why this is better**:
-   **Native**: Uses the SDK's built-in `access-control` feature / `permission-program`.
-   **No Key Management**: We don't need to manually manage shared AES keys or diffie-hellman secrets for the *result* distribution. The TEE handles the decryption for authorized readers.

## 3. Implementation Plan

### Backend Changes (`private-matchmaking` & `rps`)
1.  **Dependencies**: Ensure `ephemeral-rollups-sdk` has `access-control` feature enabled (Confirmed).
2.  **`process_match` / `join_session`**:
    -   Add `permission_program` to the accounts.
    -   Invoke `UpdatePermissionCpiBuilder` to grant `Player1` and `Player2` access to the `Game` state.

## 4. Work Estimation
-   **Complexity**: Medium (Requires correct CPI context setup).
-   **Impact**: High (Solves the privacy leak using the platform's native tools).

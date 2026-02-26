# Project Understanding: Duel

## What This Project Is

**Duel** is a reusable, privacy-preserving matchmaking protocol for Solana. It is **not a game** — it is infrastructure that any game can plug into.

The core idea: match players based on ELO inside a Trusted Execution Environment (TEE) so the queue is invisible to the public. Only the final match result gets committed back to Solana L1 as a cryptographic proof.

**RPS (Rock-Paper-Scissors) is just an example.** It exists in this repo purely to demonstrate how a game integrates with the Duel protocol. Any game that has a player account with an ELO field can become a Duel tenant by configuring:
- Which program owns player accounts
- Where ELO lives in the account data (byte offset + type)
- What ELO window to use for matching
- An optional callback to invoke when a match is found

The `duel` program and its SDK are the deliverable. The RPS game and the frontend are reference implementations.

---

## Programs

### `duel` — The Protocol (the real product)
Program ID: `EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X`

Owns these on-chain accounts:
| Account | PDA Seeds | Purpose |
|---|---|---|
| `Tenant` | `["tenant", authority]` | Config: which game program, ELO field layout, callback |
| `Queue` | `["queue", authority]` | The matchmaking queue (delegated to TEE) |
| `MatchTicket` | `["ticket", player, tenantPda]` | Per-player receipt. Created on L1, delegated to TEE, committed back |

Key instructions:
- `initialize_tenant` — one-time config per queue operator
- `initialize_queue` — creates the queue PDA linked to the tenant
- `delegate_queue` / `delegate_ticket` — hands account ownership to the TEE delegation program
- `join_queue` — TEE-only: inserts player into queue, auto-matches on ELO window
- `flush_matches` — TEE-only: updates the *opponent's* ticket (the joiner's ticket is already updated inline in `join_queue`)
- `commit_tickets` — TEE-only: pushes matched ticket state back to L1

### `rps-game` — Example Consumer (demo only, not the product)
Program ID: `8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos`

Owns these on-chain accounts:
| Account | PDA Seeds | Purpose |
|---|---|---|
| `PlayerProfile` | `["player_profile_v35", player]` | ELO, games played/won |
| `GameSession` | `["game_session_v1", p1, p2, gameId]` | One game's state |

Key instructions:
- `initialize_player` — creates a fresh profile (ELO starts at 1000)
- `delegate_pda` — delegates either a `PlayerProfile` or `GameSession` to TEE
- `start_game_with_ticket` — verifies the `MatchTicket` on L1 before creating the game session
- `make_choice` — TEE-only: records Rock/Paper/Scissors, resolves result when both chose, updates ELO
- `persist_results` — TEE-only: commits game session + both profiles back to L1
- `on_match_found` — CPI callback endpoint, called by duel's `join_queue` via Tenant PDA (`invoke_signed`)

---

## Infrastructure: L1 vs TEE

```
┌──────────────────────────────────────────────────────────────┐
│  Solana Devnet (L1)                                          │
│  Public, permanent, expensive                                │
│  - Tenant PDA (config)                                       │
│  - MatchTicket PDAs (before + after delegation)              │
│  - PlayerProfile PDAs (before + after delegation)            │
│  - GameSession PDA (after persist_results commit)            │
└──────────────────────────────────────────────────────────────┘
         ▲ delegate / commit (state sync)
         │
┌──────────────────────────────────────────────────────────────┐
│  MagicBlock TEE (Ephemeral Rollup)                           │
│  Private, fast, cheap                                        │
│  - Queue PDA (invisible to L1 while delegated)               │
│  - MatchTickets (while player is searching/matched)          │
│  - PlayerProfiles (ELO updated here during games)            │
│  - GameSession (live game state)                             │
└──────────────────────────────────────────────────────────────┘
```

**Delegation** = the account's ownership is transferred from the Solana program to the MagicBlock delegation program (`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`). While delegated, L1 sees the account as locked/unreadable by its original program.

**Commit** = the TEE pushes the current delegated state back to L1 and releases the delegation lock.

**TEE Auth** = each actor (player1, player2, queueAuthority) authenticates with the TEE via a challenge-sign HTTP flow (`/auth/challenge` → sign with wallet → `/auth/login` → JWT token). Subsequent RPC calls include `?token=<jwt>` in the URL.

---

## The ELO Bridge

The `Tenant` config teaches `duel` how to read ELO from any game's player account:

```
eloOffset: 8 + 32 = 40   ← skip 8-byte discriminator + 32-byte player pubkey
eloDataType: "u64"        ← read 8 bytes as little-endian u64
eloWindow: 100n           ← max ELO difference for a match
```

This is what makes the matchmaking engine **generic** — it doesn't know about RPS specifically, it just reads an ELO number at a known offset from whatever account the tenant program manages.

---

## Test File: Step-by-Step

### Setup (`before`)

```mermaid
sequenceDiagram
    participant T as Test Runner
    participant L1 as Solana Devnet
    participant TEE as MagicBlock TEE

    T->>T: Load payer from ~/.config/solana/id.json
    T->>T: Generate player1, player2, queueAuthority keypairs
    T->>L1: Transfer 0.1 SOL to each (SystemProgram transfer × 3, batched)
    T->>T: Derive all PDAs locally (no RPC needed)
    Note over T: tenantPda = PDA(duel, ["tenant", queueAuthority])
    Note over T: queuePda  = PDA(duel, ["queue",  queueAuthority])
    Note over T: p1TicketPda = PDA(duel, ["ticket", p1, tenantPda])
    Note over T: p2TicketPda = PDA(duel, ["ticket", p2, tenantPda])
    Note over T: p1ProfilePda = PDA(rps, ["player_profile_v35", p1])
    Note over T: p2ProfilePda = PDA(rps, ["player_profile_v35", p2])
    T->>TEE: GET /auth/challenge?pubkey=player1
    TEE-->>T: challenge bytes
    T->>T: Sign challenge with player1 private key
    T->>TEE: POST /auth/login (pubkey, challenge, signature)
    TEE-->>T: token1 (JWT)
    Note over T: Repeat for player2 → token2, queueAuthority → tokenQ
```

**What we have after setup:** 3 funded wallets, 6 derived PDAs, 3 JWT tokens for TEE auth.

---

### Test 1: Initialize Infrastructure & Delegate Queue

```mermaid
sequenceDiagram
    participant QA as queueAuthority
    participant L1 as Solana Devnet
    participant TEE as MagicBlock TEE

    QA->>L1: duel::initialize_tenant(rps_program_id, eloWindow=100, eloOffset=40, eloSize=8, callback=rps::on_match_found)
    Note over L1: Creates Tenant PDA — config stored permanently on L1

    QA->>L1: duel::initialize_queue(authority=QA, tenant=tenantPda)
    Note over L1: Creates Queue PDA — initially empty

    QA->>L1: duel::delegate_queue(pda=queuePda, validator=ER_VALIDATOR)
    Note over L1: Queue PDA transferred to delegation program — now invisible to L1 reads
    Note over L1: ER_VALIDATOR = FnE6...gySXA (specific TEE node)

    QA->>TEE: Poll /permission?pubkey=queuePda (with tokenQ)
    loop until authorizedUsers.length > 0
        TEE-->>QA: { authorizedUsers: [] }
    end
    TEE-->>QA: { authorizedUsers: [queueAuthority, ...] }
    Note over TEE: Queue is now live in the TEE
```

**On-chain state after:** `Tenant` exists on L1. `Queue` is delegated (owned by delegation program on L1, visible and writable inside TEE).

---

### Test 2: Initialize Player Profiles & Delegate

```mermaid
sequenceDiagram
    participant P1 as player1
    participant P2 as player2
    participant L1 as Solana Devnet
    participant TEE as MagicBlock TEE

    P1->>L1: rps::initialize_player(player=P1, payer=P1)
    Note over L1: Creates PlayerProfile{player: P1, elo: 1000, gamesPlayed: 0, gamesWon: 0}

    P1->>L1: rps::delegate_pda(pda=p1ProfilePda, validator=ER_VALIDATOR, accountType=PlayerProfile{player: P1})
    Note over L1: P1's profile delegated to TEE

    P1->>TEE: Poll /permission?pubkey=p1ProfilePda
    TEE-->>P1: active

    P2->>L1: rps::initialize_player(player=P2, payer=P2)
    P2->>L1: rps::delegate_pda(pda=p2ProfilePda, ...)
    P2->>TEE: Poll /permission?pubkey=p2ProfilePda
    TEE-->>P2: active
```

**Why delegate profiles to TEE?** So `make_choice` (which updates ELO) can run inside the TEE without going through L1. The TEE reads ELO directly from the delegated profile when P1 joins the queue.

---

### Test 3: P1 Creates Ticket, Delegates, Joins Queue

```mermaid
sequenceDiagram
    participant P1 as player1
    participant L1 as Solana Devnet
    participant TEE as MagicBlock TEE

    P1->>L1: duel::create_ticket(player=P1, tenant=tenantPda)
    Note over L1: MatchTicket{player: P1, tenant: tenantPda, status: Searching}

    P1->>L1: duel::delegate_ticket(pda=p1TicketPda, validator=ER_VALIDATOR)
    Note over L1: Ticket transferred to delegation program — invisible to L1

    P1->>TEE: Poll /permission?pubkey=p1TicketPda
    TEE-->>P1: active

    P1->>TEE: duel::join_queue(queue=queuePda, tenant=tenantPda, playerData=p1ProfilePda, signer=P1)
    Note over TEE: Program reads ELO from p1ProfilePda at offset 40 → 1000
    Note over TEE: QueueEntry{player: P1, elo: 1000} pushed to queue.entries
    Note over TEE: queue.entries.length == 1 → no match yet

    P1->>TEE: Fetch queue via tokenQ → assert entries.length == 1

    P1->>L1: Fetch queue via L1 RPC
    Note over L1: L1 sees 0 entries (or fails) → PRIVACY CONFIRMED
```

**Key insight:** `join_queue` runs on the TEE. The queue account is delegated, so all mutations happen inside the TEE. L1 cannot see the current queue state.

---

### Test 4: P2 Joins Queue → Auto-Match Fires

```mermaid
sequenceDiagram
    participant P2 as player2
    participant L1 as Solana Devnet
    participant TEE as MagicBlock TEE

    P2->>L1: duel::create_ticket(player=P2, tenant=tenantPda)
    P2->>L1: duel::delegate_ticket(pda=p2TicketPda, ...)
    P2->>TEE: Poll /permission?pubkey=p2TicketPda → active

    P2->>TEE: duel::join_queue(queue=queuePda, tenant=tenantPda, playerData=p2ProfilePda, signer=P2, remaining=[rps_program])

    Note over TEE: queue.entries = [{P1, elo:1000}]
    Note over TEE: P2 joins with elo:1000
    Note over TEE: |1000 - 1000| = 0 ≤ window(100) → MATCH FOUND!
    Note over TEE: queue.match_counter++ → match_id = 1

    Note over TEE: P2's ticket updated inline: Matched{opponent: P1, match_id: 1}
    Note over TEE: PendingMatch{player: P1, ...} stored in queue for flush_matches

    Note over TEE: invoke_signed → rps::on_match_found(signer=TenantPDA, p1=P2, p2=P1, match_id=1)
    Note over TEE: Tenant PDA signs via find_program_address seeds ["tenant", authority]

    Note over TEE: Both entries removed from queue.entries → length = 0

    P2->>TEE: Assert queue.entries.length == 0
    P2->>TEE: Fetch p2Ticket → status.__kind == "Matched" ✓
    P2->>TEE: Assert queue.pendingMatches.length == 1 (P1 waiting to be updated)
```

**Atomicity:** When P2 joins and triggers the match, both the match result AND the callback fire in the same `join_queue` transaction. P2's ticket is updated inline (it's a named account). P1's ticket goes into `PendingMatch` for `flush_matches` to handle — but both players receive the callback atomically from the same tx.

---

### Test 5: Flush Matches (Update P1's Ticket)

```mermaid
sequenceDiagram
    participant QA as queueAuthority
    participant TEE as MagicBlock TEE

    QA->>TEE: duel::flush_matches(queue=queuePda, tenant=tenantPda, remaining=[p1TicketPda])
    Note over TEE: Pops queue.pending_matches
    Note over TEE: For each PendingMatch:
    Note over TEE:   1. Verify p1TicketPda matches expected PDA derivation
    Note over TEE:   2. Deserialize ticket from raw account data (skip 8-byte discriminator)
    Note over TEE:   3. Assert ticket.status == Searching
    Note over TEE:   4. Set ticket.status = Matched{opponent: P2, match_id: 1}
    Note over TEE:   5. Re-serialize in-place
    Note over TEE: No callback here — callback already fired during join_queue

    QA->>TEE: Fetch p1Ticket → status.__kind == "Matched" ✓
    QA->>TEE: Assert queue.pendingMatches.length == 0 ✓
```

**Why flush_matches is separate:** When `join_queue` fires, only the joining player's ticket is in the named accounts. The opponent's ticket must be updated via `flush_matches`, which takes it as a `remaining_account`. The callback is NOT repeated here — it already fired once during `join_queue`.

---

### Test 6: Commit Tickets to L1

```mermaid
sequenceDiagram
    participant QA as queueAuthority
    participant TEE as MagicBlock TEE
    participant L1 as Solana Devnet

    QA->>TEE: duel::commit_tickets(tenant=tenantPda, payer=QA, remaining=[p1TicketPda, p2TicketPda])
    Note over TEE: commit_accounts() called on both ticket PDAs
    Note over TEE: MagicBlock SDK syncs TEE state back to L1
    Note over TEE: Delegation lock released

    Note over L1: p1Ticket.status = Matched{opponent: P2, match_id: 1}
    Note over L1: p2Ticket.status = Matched{opponent: P1, match_id: 1}

    QA->>L1: Fetch p1Ticket → status.opponent == player2.address ✓
    QA->>L1: Fetch p2Ticket → status.opponent == player1.address ✓
```

**After commit:** Both tickets are back on L1 with `Matched` status. This is the public proof that a match happened.

---

### Test 7: Play Game (Start, Moves, Persist)

```mermaid
sequenceDiagram
    participant P1 as player1
    participant P2 as player2
    participant L1 as Solana Devnet
    participant TEE as MagicBlock TEE

    Note over P1,L1: GameSession PDA = PDA(rps, ["game_session_v1", P1, P2, gameId=1])

    P1->>L1: rps::start_game_with_ticket(player=P1, matchTicket=p1TicketPda, gameId=1, opponent=P2)
    Note over L1: Reads raw bytes of p1TicketPda (from duel program)
    Note over L1: Byte 72 == 1 → status is Matched ✓
    Note over L1: Bytes 73..105 == P2.address → opponent matches ✓
    Note over L1: Creates GameSession{player1: P1, player2: P2, result: None}

    P1->>L1: rps::delegate_pda(pda=gameSessionPda, accountType=GameSession{p1,p2,id=1})
    Note over L1: GameSession delegated to TEE

    P1->>TEE: Poll /permission?pubkey=gameSessionPda → active

    P1->>TEE: rps::make_choice(gameSession, player1Profile, player2Profile, player=P1, choice=Rock)
    Note over TEE: session.player1_choice = Rock
    Note over TEE: Both choices? No → wait

    P2->>TEE: rps::make_choice(gameSession, player1Profile, player2Profile, player=P2, choice=Paper)
    Note over TEE: session.player2_choice = Paper
    Note over TEE: Both choices present → RESOLVE
    Note over TEE: Rock vs Paper → P2 wins
    Note over TEE: session.result = Winner(P2)
    Note over TEE: p1Profile.elo -= 10 → 990
    Note over TEE: p2Profile.elo += 10 → 1010
    Note over TEE: games_played++ for both, games_won++ for P2

    P1->>TEE: rps::persist_results(gameSession, p1Profile, p2Profile, payer=P1)
    Note over TEE: commit_accounts(gameSession, p1Profile, p2Profile) → sync to L1

    P1->>TEE: Fetch gameSession → result.Winner == P2.address ✓
    P1->>TEE: Assert p1Profile.elo < 1000 ✓
    P2->>TEE: Assert p2Profile.elo > 1000 ✓
```

---

### Test 8: Third-Party Verification

```mermaid
sequenceDiagram
    participant Any as Any Observer
    participant L1 as Solana Devnet

    Any->>Any: Derive p1TicketPda = PDA(duel, ["ticket", P1, tenantPda])
    Any->>L1: Fetch MatchTicket at p1TicketPda
    L1-->>Any: {player: P1, tenant: tenantPda, status: Matched{opponent: P2, match_id: 1}}

    Note over Any,L1: Anyone can verify a match happened without being either player
    Note over Any,L1: The ticket is cryptographic proof: match was done by the duel program
```

---

## Full Flow in One Diagram

```mermaid
flowchart TD
    subgraph L1["Solana L1 (Public)"]
        T[Tenant PDA\ncreated once]
        Q_L1[Queue PDA\nempty shell]
        Tick1_L1[P1 MatchTicket\nSearching]
        Tick2_L1[P2 MatchTicket\nSearching]
        Prof1_L1[P1 PlayerProfile\nelo=1000]
        Prof2_L1[P2 PlayerProfile\nelo=1000]
        GameL1[GameSession\non L1]
        Tick1_Final[P1 MatchTicket\nMatched → P2]
        Tick2_Final[P2 MatchTicket\nMatched → P1]
    end

    subgraph TEE["MagicBlock TEE (Private)"]
        Q_TEE[Queue\nentries=...]
        Tick1_TEE[P1 Ticket\nin TEE]
        Tick2_TEE[P2 Ticket\nin TEE]
        Prof1_TEE[P1 Profile\nelo updated]
        Prof2_TEE[P2 Profile\nelo updated]
        Game_TEE[GameSession\nin TEE]
    end

    T -->|delegate_queue| Q_TEE
    Tick1_L1 -->|delegate_ticket| Tick1_TEE
    Tick2_L1 -->|delegate_ticket| Tick2_TEE
    Prof1_L1 -->|delegate_pda| Prof1_TEE
    Prof2_L1 -->|delegate_pda| Prof2_TEE

    Tick1_TEE -->|join_queue + read elo| Q_TEE
    Tick2_TEE -->|join_queue → auto-match| Q_TEE

    Q_TEE -->|flush_matches| Tick1_TEE
    Q_TEE -->|join_queue inline| Tick2_TEE

    Tick1_TEE -->|commit_tickets| Tick1_Final
    Tick2_TEE -->|commit_tickets| Tick2_Final

    Tick1_Final -->|start_game_with_ticket\nverify match proof| GameL1
    GameL1 -->|delegate_pda| Game_TEE

    Game_TEE -->|make_choice P1=Rock| Game_TEE
    Game_TEE -->|make_choice P2=Paper\n→ resolve result\n→ update ELO| Game_TEE
    Game_TEE -->|persist_results\n commit_accounts| GameL1
    Prof1_TEE -->|persist_results| Prof1_L1
    Prof2_TEE -->|persist_results| Prof2_L1
```

---

## Known Design Decisions / Things to Confirm

### Things I'm confident about
- The queue is **truly private** while delegated — L1 cannot see who is searching
- The `MatchTicket` is the player's **proof of match** on L1 — anyone can verify it
- ELO is read generically from any account at a configured byte offset — the matchmaker is game-agnostic
- `flush_matches` requires the caller to pass opponent ticket PDAs as `remaining_accounts` — this is intentional (permissionless crank design)
- The `on_match_found` callback is CPI-called during `join_queue` via **Tenant PDA** (`invoke_signed`), not during `flush_matches`
- The Tenant PDA is an unforgeable signer — only the duel program can produce it; game devs can verify the callback is authentic without any extra access control

### Things that may need alignment

1. **`start_game_with_ticket` reads raw ticket bytes** — it hardcodes byte offset 72 for the status discriminator and 73..105 for the opponent. This is fragile. If `MatchTicket` layout changes, the game program breaks silently.

2. **`gameId` is hardcoded to `1n` in the test** — in production, who assigns game IDs? Currently the client decides. Two players could race and create different sessions with the same ID.

3. **Profiles are still delegated after `persist_results`** — `commit_accounts` moves state to L1 but does it release the delegation lock? If not, the next game can't create a new session that writes to those profiles unless they're re-delegated.

4. **The callback (`on_match_found`) just logs** — the comment says "could auto-create a game session". Is the intent to eventually auto-start games via CPI, or will clients always call `start_game_with_ticket` manually? The callback now receives the Tenant PDA as a verifiable signer, so game devs can safely act on it.

5. **`flush_matches` is called by the queue authority** — is this meant to be permissionless (any TEE-authenticated user can crank it), or is it intended to only be the queue operator? The code says "any TEE-authenticated wallet" in the comment, but the test only has the queue authority do it.

6. **Profiles are shared across games** — two simultaneous games involving the same player would both try to write to the same delegated profile in TEE. Is there a concurrency plan?

# Competitive Analysis: The "Bleeding Edge"

## Executive Summary
Unlike existing Web3 matchmaking solutions that force a trade-off between **Privacy** (ZK-Rollups) and **Speed** (Public L1s), our protocol leverages **Trusted Execution Environments (TEEs)** via Ephemeral Rollups to achieve the **"Holy Trinity" of Matchmaking**:
1.  **Web2 Latency** (Instant Matching)
2.  **Dark Pool Privacy** (No Sniping/MEV)
3.  **L1 Composability** (Trustless)

---

## 1. vs. Public On-Chain Queues
*Examples: Traditional Anchor/Solana matchmaking.*

| Feature | The "Status Quo" | Our Protocol (Bleeding Edge) |
| :--- | :--- | :--- |
| **Privacy** | **Zero.** Observers can see ELO, strategy, and queue depth. Stream sniping is trivial. | **Dark Pool.** Queue state is inside a TEE. Even the Validator cannot read the memory. |
| **MEV** | **High.** Bots can front-run `join` transactions to block matches or grief players. | **None.** Match logic happens off-chain in the TEE; only the *result* hits L1. |
| **Scaling** | **Finite.** O(n) loops hit Gas Limits. Capped at ~1k players/queue. | **Infinite.** **Page Registry (Imp 7.4)** allows horizontal scaling to millions of concurrents. |

## 2. vs. Zero-Knowledge (ZK) Matchmaking
*Examples: Dark Forest / ZK-Rollup games.*

| Feature | ZK Solutions | Our Protocol (Bleeding Edge) |
| :--- | :--- | :--- |
| **Latency** | **Slow.** Generating a Client-Side Proof for a "Join" or "Move" takes 2s - 10s. | **Instant.** Encryption (AES/ECIES) takes microseconds. Matching is effectively real-time. |
| **Complexity** | **Extreme.** Requires custom Circuits for every new game rule. | **Game Agnostic.** **Matchable Interface (Imp 7.2)** lets *any* Solana program plug in just by exposing an ELO API. |
| **UX** | **Heavy.** Requires powerful client devices to solve proofs. | **Light.** Runs on mobile browsers. |

## 3. vs. Centralized Off-Chain Servers
*Examples: Web2 Games (League of Legends, Fortnite).*

| Feature | Web2 Servers | Our Protocol (Bleeding Edge) |
| :--- | :--- | :--- |
| **Trust** | **None.** Server operator can rig matches or discriminate. | **Verifiable.** TEE Remote Attestation proves the code running is exactly the open-source logic. |
| **Liquidity** | **Siloed.** Only one company's players. | **Global.** A shared "Liquidity Layer" for matchmaking. Multiple frontends can tap into the same protocol. |

---

## The "Killer Feature": Hybrid Matching (Imp 7.5)
Most blockchain games use a "Crank" (10-30s delay).
We use **Atomic Hybrid Matching**:
-   **90% of Matches**: Happen **Synchronously** within the `join_session` transaction. **0ms added latency.**
-   **10% of Matches** (Low Liquidity): Handled by the background widener.

**Verdict**: We are building the first protocol that feels like a centralized server (Speed/UX) but retains the sovereign properties of crypto (Privacy/Trust).

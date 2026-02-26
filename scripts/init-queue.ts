import {
  createSolanaRpc,
  createKeyPairSignerFromBytes,
  type Address,
} from "@solana/kit";
import { MatchmakingAdmin, fetchMaybeTenant, fetchMaybeQueue, utils } from "../sdk/src/index.js";

const { deriveQueuePda, deriveTenantPda } = utils;
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DUEL_PROGRAM_ID = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X" as Address;
const RPS_GAME_PROGRAM_ID = "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos" as Address;
const ER_VALIDATOR = "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA" as Address;
const L1_RPC_URL = "https://api.devnet.solana.com";

async function main() {
  const rpc = createSolanaRpc(L1_RPC_URL);

  // Load signer: prefer dedicated tenant authority, fall back to Solana default wallet
  const tenantKeypairPath = join(__dirname, "../.tenant-authority.json");
  const walletPath = tenantKeypairPath && existsSync(tenantKeypairPath)
    ? tenantKeypairPath
    : `${homedir()}/.config/solana/id.json`;

  const keypairBytes = new Uint8Array(JSON.parse(readFileSync(walletPath, "utf-8")));
  const signer = await createKeyPairSignerFromBytes(keypairBytes);

  console.log("Initializing Matchmaking Infrastructure...");
  console.log("Signer:", signer.address);
  console.log("");

  const queueAuthority = signer.address;
  const tenantPda = await deriveTenantPda(DUEL_PROGRAM_ID, queueAuthority);
  const queuePda = await deriveQueuePda(DUEL_PROGRAM_ID, queueAuthority);

  console.log("Queue Authority:", queueAuthority);
  console.log("Tenant PDA:", tenantPda);
  console.log("Queue PDA:", queuePda);
  console.log("");

  // Check if already initialized
  const maybeTenant = await fetchMaybeTenant(rpc, tenantPda);
  if (maybeTenant.exists) {
    const maybeQueue = await fetchMaybeQueue(rpc, queuePda);
    console.log("Tenant already exists - skipping initialization");
    if (maybeQueue.exists) {
      console.log("Queue already exists - skipping initialization");
      console.log("  Current queue entries:", maybeQueue.data.entries.length);
    }
    console.log("");
    console.log("Matchmaking infrastructure is ready!");
    return;
  }

  const mmAdmin = new MatchmakingAdmin(rpc, signer, DUEL_PROGRAM_ID);

  // 1. Initialize Tenant
  console.log("1. Initializing Tenant...");
  const hashBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode("global:on_match_found"))
  );
  const callbackDiscriminator = Array.from(hashBytes.slice(0, 8));
  await mmAdmin.initializeTenant(RPS_GAME_PROGRAM_ID, {
    eloWindow: 100n,
    eloOffset: 8 + 32,
    eloDataType: "u64",
    callbackProgramId: RPS_GAME_PROGRAM_ID,
    callbackDiscriminator,
  });
  console.log("   Tenant initialized");

  // 2. Initialize Queue
  console.log("2. Initializing Queue...");
  await mmAdmin.initializeQueue(queueAuthority, tenantPda);
  console.log("   Queue initialized");

  // 3. Delegate Queue to TEE
  console.log("3. Delegating Queue to TEE...");
  await mmAdmin.delegateQueue(queueAuthority, ER_VALIDATOR);
  console.log("   Queue delegated to TEE");

  console.log("");
  console.log("Matchmaking infrastructure initialized successfully!");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

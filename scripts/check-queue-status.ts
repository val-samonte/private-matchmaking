import { createSolanaRpc, type Address } from "@solana/kit";
import { fetchMaybeTenant, fetchMaybeQueue, utils } from "../sdk/src/index.js";

const { deriveQueuePda, deriveTenantPda } = utils;

const DUEL_PROGRAM_ID = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X" as Address;
const RPS_GAME_PROGRAM_ID = "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos" as Address;
const L1_RPC_URL = "https://api.devnet.solana.com";

// Pass queue authority as first CLI arg, or defaults to RPS program ID
const queueAuthority = (process.argv[2] ?? RPS_GAME_PROGRAM_ID) as Address;

async function main() {
  const rpc = createSolanaRpc(L1_RPC_URL);

  const tenantPda = await deriveTenantPda(DUEL_PROGRAM_ID, queueAuthority);
  const queuePda = await deriveQueuePda(DUEL_PROGRAM_ID, queueAuthority);

  console.log("Queue Authority:", queueAuthority);
  console.log("Tenant PDA:", tenantPda);
  console.log("Queue PDA:", queuePda);
  console.log("");

  const maybeTenant = await fetchMaybeTenant(rpc, tenantPda);
  if (maybeTenant.exists) {
    const t = maybeTenant.data;
    console.log("Tenant exists:");
    console.log("  - Authority:", t.authority);
    console.log("  - Tenant Program ID:", t.tenantProgramId);
    console.log("  - ELO Offset:", t.eloOffset);
    console.log("  - ELO Size:", t.eloSize);
    console.log("  - ELO Window:", t.eloWindow.toString());
  } else {
    console.log("Tenant does NOT exist - run: npx tsx scripts/init-queue.ts");
  }
  console.log("");

  const maybeQueue = await fetchMaybeQueue(rpc, queuePda);
  if (maybeQueue.exists) {
    const q = maybeQueue.data;
    console.log("Queue exists:");
    console.log("  - Authority:", q.authority);
    console.log("  - Tenant:", q.tenant);
    console.log("  - Entries:", q.entries.length);
  } else {
    console.log("Queue does NOT exist - run: npx tsx scripts/init-queue.ts");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

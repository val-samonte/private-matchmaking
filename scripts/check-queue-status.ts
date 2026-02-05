import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Duel } from "../target/types/duel";
import { RpsGame } from "../target/types/rps_game";
import { PublicKey } from "@solana/web3.js";

// This script checks if the queue and tenant are initialized
async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const duelProgram = anchor.workspace.Duel as Program<Duel>;
  const rpsProgram = anchor.workspace.RpsGame as Program<RpsGame>;

  // Queue authority is the RPS game program ID
  const queueAuthority = rpsProgram.programId;
  
  const [queuePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("queue"), queueAuthority.toBuffer()],
    duelProgram.programId
  );

  const [tenantPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tenant"), queueAuthority.toBuffer()],
    duelProgram.programId
  );

  console.log("Queue Authority (RPS Program):", queueAuthority.toBase58());
  console.log("Queue PDA:", queuePda.toBase58());
  console.log("Tenant PDA:", tenantPda.toBase58());
  console.log("");

  // Check if tenant exists
  try {
    const tenant = await duelProgram.account.tenant.fetch(tenantPda);
    console.log("✅ Tenant exists:");
    console.log("  - Authority:", tenant.authority.toBase58());
    console.log("  - Tenant Program ID:", tenant.tenantProgramId.toBase58());
    console.log("  - ELO Offset:", tenant.eloOffset);
    console.log("  - ELO Size:", tenant.eloSize);
    console.log("  - ELO Window:", tenant.eloWindow.toString());
  } catch (err) {
    console.log("❌ Tenant does NOT exist");
    console.log("   You need to run: npm run init-queue");
  }
  console.log("");

  // Check if queue exists
  try {
    const queue = await duelProgram.account.queue.fetch(queuePda);
    console.log("✅ Queue exists:");
    console.log("  - Authority:", queue.authority.toBase58());
    console.log("  - Tenant:", queue.tenant.toBase58());
    console.log("  - Entries:", queue.entries.length);
  } catch (err) {
    console.log("❌ Queue does NOT exist");
    console.log("   You need to run: npm run init-queue");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Duel } from "../target/types/duel";
import { RpsGame } from "../target/types/rps_game";
import { PublicKey, Keypair } from "@solana/web3.js";
import { MatchmakingAdmin } from "../sdk/src";
import * as fs from "fs";
import * as path from "path";

/**
 * Initialize the matchmaking queue and tenant for the RPS game
 * This must be run ONCE before players can join the queue
 */
async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const duelProgram = anchor.workspace.Duel as Program<Duel>;
  const rpsProgram = anchor.workspace.RpsGame as Program<RpsGame>;

  console.log("Initializing Matchmaking Infrastructure...");
  console.log("");

  // Check if tenant authority keypair file exists
  const tenantKeypairPath = path.join(__dirname, "../.tenant-authority.json");
  let wallet: Keypair;
  let queueAuthority: PublicKey;
  
  if (fs.existsSync(tenantKeypairPath)) {
    // Use dedicated tenant authority
    const keypairData = JSON.parse(fs.readFileSync(tenantKeypairPath, "utf-8"));
    wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
    queueAuthority = wallet.publicKey;
    console.log("Using dedicated tenant authority keypair");
  } else {
    // Use wallet from provider (your personal wallet)
    wallet = (provider.wallet as anchor.Wallet).payer;
    queueAuthority = wallet.publicKey;
    console.log("Using wallet as tenant authority");
  }
  
  
  const [queuePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("queue"), queueAuthority.toBuffer()],
    duelProgram.programId
  );

  const [tenantPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tenant"), queueAuthority.toBuffer()],
    duelProgram.programId
  );

  console.log("Queue Authority (Wallet):", queueAuthority.toBase58());
  console.log("RPS Program ID:", rpsProgram.programId.toBase58());
  console.log("Queue PDA:", queuePda.toBase58());
  console.log("Tenant PDA:", tenantPda.toBase58());
  console.log("");

  // Check if already initialized
  try {
    await duelProgram.account.tenant.fetch(tenantPda);
    console.log("✅ Tenant already exists - skipping initialization");
    
    const queue = await duelProgram.account.queue.fetch(queuePda);
    console.log("✅ Queue already exists - skipping initialization");
    console.log("   Current queue entries:", queue.entries.length);
    console.log("");
    console.log("Matchmaking infrastructure is ready!");
    return;
  } catch (err) {
    // Not initialized yet - continue
    console.log("Initializing new matchmaking infrastructure...");
  }

  // Initialize using SDK
  const mmAdmin = new MatchmakingAdmin(provider, duelProgram.programId);

  // 1. Initialize Tenant
  console.log("1. Initializing Tenant...");
  try {
    await mmAdmin.initializeTenant(
      rpsProgram.programId, // tenant program ID (RPS game)
      {
        authority: queueAuthority,
        eloWindow: 100, // Match players within 100 ELO points
        eloOffset: 8 + 32, // Offset to ELO field in PlayerProfile (discriminator + player pubkey)
        eloDataType: 'u64' // ELO is stored as u64
      },
      undefined, // confirmOptions
      [wallet] // signers - pass the wallet keypair
    );
    console.log("   ✅ Tenant initialized");
  } catch (err: any) {
    console.error("   ❌ Failed to initialize tenant:", err.message);
    throw err;
  }

  // 2. Initialize Queue
  console.log("2. Initializing Queue...");
  try {
    await mmAdmin.initializeQueue(
      queueAuthority,
      tenantPda,
      undefined, // confirmOptions
      [wallet] // signers
    );
    console.log("   ✅ Queue initialized");
  } catch (err: any) {
    console.error("   ❌ Failed to initialize queue:", err.message);
    throw err;
  }

  // 3. Delegate Queue to TEE (for privacy)
  console.log("3. Delegating Queue to TEE...");
  const ER_VALIDATOR = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");
  
  try {
    await mmAdmin.delegateQueue(
      queueAuthority,
      ER_VALIDATOR,
      undefined, // confirmOptions
      [wallet] // signers
    );
    console.log("   ✅ Queue delegated to TEE");
  } catch (err: any) {
    console.error("   ❌ Failed to delegate queue:", err.message);
    throw err;
  }

  console.log("");
  console.log("🎉 Matchmaking infrastructure initialized successfully!");
  console.log("");
  console.log("Players can now join the queue via the frontend.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

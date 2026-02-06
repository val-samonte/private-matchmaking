import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";

/**
 * Generate a dedicated tenant authority keypair
 * This keypair will be used for:
 * 1. Tenant authority (queue management)
 * 2. TEE authentication (shared session for all players)
 */
async function main() {
  console.log("Generating Dedicated Tenant Authority Keypair...");
  console.log("");

  // Generate new keypair
  const tenantAuthority = Keypair.generate();
  
  console.log("✅ Keypair generated");
  console.log("   Public Key:", tenantAuthority.publicKey.toBase58());
  console.log("");

  // Encode private key as base58
  const privateKeyBase58 = bs58.encode(tenantAuthority.secretKey);
  
  // Save to frontend .env.local
  const envPath = path.join(__dirname, "../frontend/.env.local");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Update environment variables
  const updates = [
    { key: "TENANT_AUTHORITY_PRIVATE_KEY", value: privateKeyBase58 },
    { key: "NEXT_PUBLIC_QUEUE_AUTHORITY", value: tenantAuthority.publicKey.toBase58() },
  ];

  for (const { key, value } of updates) {
    const line = `${key}=${value}`;
    
    if (envContent.includes(`${key}=`)) {
      envContent = envContent.replace(new RegExp(`${key}=.*`), line);
    } else {
      envContent += `\n${line}\n`;
    }
  }

  fs.writeFileSync(envPath, envContent);
  
  console.log("✅ Configuration saved to frontend/.env.local");
  console.log("");
  console.log("⚠️  NEXT STEPS:");
  console.log("   1. Fund the tenant authority with SOL:");
  console.log(`      solana airdrop 2 ${tenantAuthority.publicKey.toBase58()} --url devnet`);
  console.log("");
  console.log("   2. Initialize the queue with this authority:");
  console.log("      TENANT_AUTHORITY_KEY=<private_key> anchor run init-queue");
  console.log("");
  console.log("   3. Restart your dev server:");
  console.log("      cd frontend && npm run dev -- --webpack");
  console.log("");
  
  // Save keypair to a temporary file for init-queue to use
  const keypairPath = path.join(__dirname, "../.tenant-authority.json");
  fs.writeFileSync(
    keypairPath,
    JSON.stringify(Array.from(tenantAuthority.secretKey))
  );
  
  console.log("✅ Keypair saved to .tenant-authority.json (temporary, for init-queue)");
  console.log("");
  console.log("🔒 SECURITY:");
  console.log("   - .tenant-authority.json is gitignored");
  console.log("   - Private key is only in .env.local (server-side)");
  console.log("   - Delete .tenant-authority.json after running init-queue");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

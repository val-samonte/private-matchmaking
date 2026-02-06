import * as anchor from "@coral-xyz/anchor";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";

/**
 * Export tenant authority private key for backend API use
 * This should be run ONCE to configure the backend
 */
async function main() {
  const provider = anchor.AnchorProvider.env();
  const wallet = (provider.wallet as anchor.Wallet).payer;
  
  console.log("Exporting Tenant Authority Private Key...");
  console.log("Tenant Authority:", wallet.publicKey.toBase58());
  console.log("");

  // Encode private key as base58
  const privateKeyBase58 = bs58.encode(wallet.secretKey);
  
  console.log("✅ Private key encoded");
  console.log("");

  // Update frontend .env.local
  const envPath = path.join(__dirname, "../frontend/.env.local");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Add/update private key (server-side only, not exposed to client)
  const keyLine = `TENANT_AUTHORITY_PRIVATE_KEY=${privateKeyBase58}`;
  
  if (envContent.includes("TENANT_AUTHORITY_PRIVATE_KEY=")) {
    envContent = envContent.replace(
      /TENANT_AUTHORITY_PRIVATE_KEY=.*/,
      keyLine
    );
  } else {
    envContent += `\n# Tenant Authority Private Key (SERVER-SIDE ONLY - for API routes)\n${keyLine}\n`;
  }

  // Remove the client-side TEE token if it exists (no longer needed)
  if (envContent.includes("NEXT_PUBLIC_TENANT_TEE_TOKEN=")) {
    envContent = envContent.replace(/NEXT_PUBLIC_TENANT_TEE_TOKEN=.*\n?/g, "");
    console.log("⚠️  Removed NEXT_PUBLIC_TENANT_TEE_TOKEN (no longer needed - using API routes)");
  }

  fs.writeFileSync(envPath, envContent);
  
  console.log("✅ Private key saved to frontend/.env.local");
  console.log("");
  console.log("⚠️  IMPORTANT: Restart your dev server to apply changes!");
  console.log("   cd frontend && npm run dev -- --webpack");
  console.log("");
  console.log("🔒 SECURITY NOTE:");
  console.log("   - Private key is stored in .env.local (gitignored)");
  console.log("   - Only accessible by Next.js API routes (server-side)");
  console.log("   - Never exposed to client-side code");
  console.log("   - In production, use environment variables or secret manager");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

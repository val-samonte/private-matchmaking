import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
import * as fs from "fs";
import * as path from "path";

/**
 * Generate TEE authentication token for the tenant authority
 * This token should be used by ALL players to access the shared matchmaking queue
 */
async function main() {
  const provider = anchor.AnchorProvider.env();
  const wallet = (provider.wallet as anchor.Wallet).payer;
  
  const TEE_RPC_URL = process.env.TEE_RPC_URL || "https://tee.magicblock.app";
  
  console.log("Generating Tenant Authority TEE Token...");
  console.log("Tenant Authority:", wallet.publicKey.toBase58());
  console.log("");

  // Get TEE auth token for tenant authority
  const { token } = await getAuthToken(
    TEE_RPC_URL,
    wallet.publicKey,
    (msg) => Promise.resolve(nacl.sign.detached(msg, wallet.secretKey))
  );

  console.log("✅ TEE Token generated");
  console.log("");
  console.log("Token (first 20 chars):", token.substring(0, 20) + "...");
  console.log("");

  // Save to frontend .env.local
  const envPath = path.join(__dirname, "../frontend/.env.local");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Update or add TEE token
  const tokenLine = `NEXT_PUBLIC_TENANT_TEE_TOKEN=${token}`;
  
  if (envContent.includes("NEXT_PUBLIC_TENANT_TEE_TOKEN=")) {
    // Replace existing
    envContent = envContent.replace(
      /NEXT_PUBLIC_TENANT_TEE_TOKEN=.*/,
      tokenLine
    );
  } else {
    // Add new
    envContent += `\n# Tenant Authority TEE Token (for shared matchmaking queue access)\n${tokenLine}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  
  console.log("✅ Token saved to frontend/.env.local");
  console.log("");
  console.log("⚠️  IMPORTANT: Restart your dev server to apply changes!");
  console.log("   cd frontend && npm run dev -- --webpack");
  console.log("");
  console.log("⚠️  SECURITY NOTE: This token grants access to the matchmaking queue.");
  console.log("   In production, use a backend service instead of exposing the token.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

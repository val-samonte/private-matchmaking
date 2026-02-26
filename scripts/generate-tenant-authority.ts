import { generateKeyPairSigner, getBase58Decoder } from "@solana/kit";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Generating Dedicated Tenant Authority Keypair...");
  console.log("");

  const tenantAuthority = await generateKeyPairSigner();

  // Export raw key bytes for Solana CLI keypair format (64 bytes: seed + pubkey)
  const privKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", tenantAuthority.keyPair.privateKey)
  );
  const pubKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", tenantAuthority.keyPair.publicKey)
  );
  // Ed25519 PKCS8: last 32 bytes are the seed
  const seed32 = privKeyPkcs8.slice(-32);
  const keypairBytes = new Uint8Array(64);
  keypairBytes.set(seed32);
  keypairBytes.set(pubKeyRaw, 32);

  const address = tenantAuthority.address;
  const privateKeyBase58 = getBase58Decoder().decode(keypairBytes);

  console.log("Keypair generated");
  console.log("  Public Key:", address);
  console.log("");

  // Save keypair JSON (Solana CLI format) for init-queue
  const keypairPath = join(__dirname, "../.tenant-authority.json");
  writeFileSync(keypairPath, JSON.stringify(Array.from(keypairBytes)));
  console.log("Keypair saved to .tenant-authority.json");

  // Update frontend/.env.local
  const envPath = join(__dirname, "../frontend/.env.local");
  let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

  const updates: [string, string][] = [
    ["TENANT_AUTHORITY_PRIVATE_KEY", privateKeyBase58 as string],
    ["NEXT_PUBLIC_QUEUE_AUTHORITY", address],
  ];

  for (const [key, value] of updates) {
    const line = `${key}=${value}`;
    if (envContent.includes(`${key}=`)) {
      envContent = envContent.replace(new RegExp(`${key}=.*`), line);
    } else {
      envContent += `\n${line}\n`;
    }
  }
  writeFileSync(envPath, envContent);
  console.log("Configuration saved to frontend/.env.local");

  console.log("");
  console.log("NEXT STEPS:");
  console.log(`  1. Fund: solana airdrop 2 ${address} --url devnet`);
  console.log("  2. Init:  npx tsx scripts/init-queue.ts");
  console.log("  3. Delete .tenant-authority.json after init");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

import { createKeyPairSignerFromBytes, getBase58Decoder } from "@solana/kit";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const keypairPath = join(__dirname, "../.tenant-authority.json");
const envPath = join(__dirname, "../frontend/.env.local");

if (!existsSync(keypairPath)) {
  console.error("Keypair file not found!");
  process.exit(1);
}

const secretKey = new Uint8Array(JSON.parse(readFileSync(keypairPath, "utf-8")));
const signer = await createKeyPairSignerFromBytes(secretKey);
const publicKey = signer.address;
const privateKey = getBase58Decoder().decode(secretKey) as string;

console.log("Updating .env.local with new Tenant Authority...");
console.log("Public Key:", publicKey);

let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

const updates: [string, string][] = [
  ["TENANT_AUTHORITY_PRIVATE_KEY", privateKey],
  ["NEXT_PUBLIC_QUEUE_AUTHORITY", publicKey],
];

for (const [key, value] of updates) {
  if (envContent.includes(`${key}=`)) {
    envContent = envContent.replace(new RegExp(`${key}=.*`), `${key}=${value}`);
  } else {
    envContent += `\n${key}=${value}\n`;
  }
}

writeFileSync(envPath, envContent);
console.log("Updated .env.local");

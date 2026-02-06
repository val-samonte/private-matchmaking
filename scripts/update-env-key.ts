import * as fs from "fs";
import * as path from "path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const keypairPath = path.join(__dirname, "../../.tenant-authority.json");
const envPath = path.join(__dirname, "../../frontend/.env.local");

if (!fs.existsSync(keypairPath)) {
    console.error("Keypair file not found!");
    process.exit(1);
}

const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
const keypair = Keypair.fromSecretKey(secretKey);
const publicKey = keypair.publicKey.toBase58();
const privateKey = bs58.encode(secretKey);

console.log("Updating .env.local with new Tenant Authority...");
console.log("Public Key:", publicKey);

let envContent = "";
if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
}

const updates = [
    { key: "TENANT_AUTHORITY_PRIVATE_KEY", value: privateKey },
    { key: "NEXT_PUBLIC_QUEUE_AUTHORITY", value: publicKey },
];

for (const { key, value } of updates) {
    if (envContent.includes(`${key}=`)) {
        envContent = envContent.replace(new RegExp(`${key}=.*`), `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}\n`;
    }
}

fs.writeFileSync(envPath, envContent);
console.log("✅ Updated .env.local");

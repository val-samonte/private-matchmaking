import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Duel } from "@/lib/types/duel_idl";
import DuelIDL from "@1upmonster/duel/dist/duel.json";

// Server-side only: Tenant authority keypair
// In production, load from secure environment variable or secret manager
function getTenantAuthority(): Keypair {
  const privateKey = process.env.TENANT_AUTHORITY_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error("TENANT_AUTHORITY_PRIVATE_KEY not configured");
  }
  
  // Decode base58 private key
  const secretKey = bs58.decode(privateKey);
  return Keypair.fromSecretKey(secretKey);
}

// Cache TEE token (refresh every hour)
let cachedTeeToken: { token: string; expiresAt: number } | null = null;

async function getTeeToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid
  if (cachedTeeToken && cachedTeeToken.expiresAt > now) {
    return cachedTeeToken.token;
  }
  
  // Generate new token
  const tenantAuthority = getTenantAuthority();
  const TEE_RPC_URL = process.env.TEE_RPC_URL || "https://tee.magicblock.app";
  
  const { token } = await getAuthToken(
    TEE_RPC_URL,
    tenantAuthority.publicKey,
    (msg) => Promise.resolve(nacl.sign.detached(msg, tenantAuthority.secretKey))
  );
  
  // Cache for 1 hour
  cachedTeeToken = {
    token,
    expiresAt: now + 60 * 60 * 1000,
  };
  
  return token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerPubkey, profilePda } = body;
    
    if (!playerPubkey || !profilePda) {
      return NextResponse.json(
        { error: "Missing playerPubkey or profilePda" },
        { status: 400 }
      );
    }
    
    // Get TEE token (server-side, secure)
    const teeToken = await getTeeToken();
    
    const TEE_RPC_URL = process.env.TEE_RPC_URL || "https://tee.magicblock.app";
    const TEE_WS_URL = process.env.TEE_WS_URL || "wss://tee.magicblock.app";
    const DUEL_PROGRAM_ID = new PublicKey(
      process.env.NEXT_PUBLIC_DUEL_PROGRAM_ID || "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X"
    );
    const QUEUE_AUTHORITY = new PublicKey(
      process.env.NEXT_PUBLIC_QUEUE_AUTHORITY || "Fh68kkXwFDubEdkRRBuWCXBdTr2YtnM52ASA7fxHrbCw"
    );
    
    // Create TEE provider (server-side)
    const connection = new Connection(`${TEE_RPC_URL}?token=${teeToken}`, {
      wsEndpoint: `${TEE_WS_URL}?token=${teeToken}`,
      commitment: "confirmed",
    });
    
    const tenantAuthority = getTenantAuthority();
    const wallet = new Wallet(tenantAuthority);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    
    const duelProgram = new Program(DuelIDL as any, provider) as Program<Duel>;
    
    // Derive queue and tenant PDAs
    const [queuePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("queue"), QUEUE_AUTHORITY.toBuffer()],
      DUEL_PROGRAM_ID
    );
    
    const [tenantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tenant"), QUEUE_AUTHORITY.toBuffer()],
      DUEL_PROGRAM_ID
    );
    
    // Join queue on behalf of player
    await duelProgram.methods
      .joinQueue()
      .accountsPartial({
        queue: queuePda,
        tenant: tenantPda,
        playerData: new PublicKey(profilePda),
        signer: new PublicKey(playerPubkey),
      })
      .rpc();
    
    console.log(`Player ${playerPubkey} joined queue`);
    
    return NextResponse.json({
      success: true,
      queuePda: queuePda.toBase58(),
      message: "Joined queue successfully",
    });
    
  } catch (error: any) {
    console.error("Join queue error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to join queue" },
      { status: 500 }
    );
  }
}

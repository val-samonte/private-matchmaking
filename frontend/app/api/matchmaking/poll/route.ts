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
function getTenantAuthority(): Keypair {
  const privateKey = process.env.TENANT_AUTHORITY_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error("TENANT_AUTHORITY_PRIVATE_KEY not configured");
  }
  
  const secretKey = bs58.decode(privateKey);
  return Keypair.fromSecretKey(secretKey);
}

// Cache TEE token
let cachedTeeToken: { token: string; expiresAt: number } | null = null;

async function getTeeToken(): Promise<string> {
  const now = Date.now();
  
  if (cachedTeeToken && cachedTeeToken.expiresAt > now) {
    return cachedTeeToken.token;
  }
  
  const tenantAuthority = getTenantAuthority();
  const TEE_RPC_URL = process.env.TEE_RPC_URL || "https://tee.magicblock.app";
  
  const { token } = await getAuthToken(
    TEE_RPC_URL,
    tenantAuthority.publicKey,
    (msg) => Promise.resolve(nacl.sign.detached(msg, tenantAuthority.secretKey))
  );
  
  cachedTeeToken = {
    token,
    expiresAt: now + 60 * 60 * 1000,
  };
  
  return token;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerPubkey = searchParams.get("playerPubkey");
    
    if (!playerPubkey) {
      return NextResponse.json(
        { error: "Missing playerPubkey" },
        { status: 400 }
      );
    }
    
    // Get TEE token (server-side)
    const teeToken = await getTeeToken();
    
    const TEE_RPC_URL = process.env.TEE_RPC_URL || "https://tee.magicblock.app";
    const TEE_WS_URL = process.env.TEE_WS_URL || "wss://tee.magicblock.app";
    const DUEL_PROGRAM_ID = new PublicKey(
      process.env.NEXT_PUBLIC_DUEL_PROGRAM_ID || "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X"
    );
    const QUEUE_AUTHORITY = new PublicKey(
      process.env.NEXT_PUBLIC_QUEUE_AUTHORITY || "Fh68kkXwFDubEdkRRBuWCXBdTr2YtnM52ASA7fxHrbCw"
    );
    
    // Create TEE provider
    const connection = new Connection(`${TEE_RPC_URL}?token=${teeToken}`, {
      wsEndpoint: `${TEE_WS_URL}?token=${teeToken}`,
      commitment: "confirmed",
    });
    
    const tenantAuthority = getTenantAuthority();
    const wallet = new Wallet(tenantAuthority);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    
    const duelProgram = new Program(DuelIDL as any, provider) as Program<Duel>;
    
    // Derive queue PDA
    const [queuePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("queue"), QUEUE_AUTHORITY.toBuffer()],
      DUEL_PROGRAM_ID
    );
    
    // Fetch queue state
    const queueAccount = await duelProgram.account.queue.fetch(queuePda);
    
    // Check if player is still in queue
    const playerInQueue = queueAccount.entries.some((entry: any) =>
      entry.player.equals(new PublicKey(playerPubkey))
    );
    
    if (!playerInQueue) {
      // Check if matched in recent history
      const match = queueAccount.matches.find((m: any) => 
        m.player1.equals(new PublicKey(playerPubkey)) || 
        m.player2.equals(new PublicKey(playerPubkey))
      );
      
      if (match) {
        const isPlayer1 = match.player1.equals(new PublicKey(playerPubkey));
        const opponent = isPlayer1 ? match.player2 : match.player1;
        
        // Use match timestamp as game ID properly
        // match.timestamp is BN or number depending on deserialization
        const gameId = match.timestamp.toString(); 
        
        return NextResponse.json({
          status: "matched",
          queueLength: queueAccount.entries.length,
          opponent: opponent.toBase58(),
          gameId: gameId,
          role: isPlayer1 ? "player1" : "player2"
        });
      }
      
      // Not in queue and not in recent matches?
      // Maybe removed for inactivity or other reason
      return NextResponse.json({
        status: "idle",
        queueLength: queueAccount.entries.length,
      });
    }
    
    return NextResponse.json({
      status: "searching",
      queueLength: queueAccount.entries.length,
    });
    
  } catch (error: any) {
    console.error("Poll queue error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to poll queue" },
      { status: 500 }
    );
  }
}

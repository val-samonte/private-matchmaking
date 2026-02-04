import { PublicKey } from "@solana/web3.js";

// Program IDs
export const RPS_GAME_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_RPS_PROGRAM_ID || "8ohu3RobXyZ2DebyJjbs2co9YCG275FUsVckEcmDbCos"
);

export const DUEL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_DUEL_PROGRAM_ID || "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X"
);

export const ER_VALIDATOR = new PublicKey(
  process.env.NEXT_PUBLIC_ER_VALIDATOR || "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"
);

// Seeds
export const PLAYER_PROFILE_SEED = "player_profile_v35";
export const GAME_SESSION_SEED = "game_session_v1";
export const QUEUE_SEED = "queue";
export const TENANT_SEED = "tenant";

// TEE Configuration
export const TEE_RPC_URL = process.env.NEXT_PUBLIC_TEE_RPC_URL || "https://tee.magicblock.app";
export const TEE_WS_URL = process.env.NEXT_PUBLIC_TEE_WS_URL || "wss://tee.magicblock.app";

// Network
export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";

// RPC Endpoints
export const RPC_ENDPOINTS = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
} as const;

// Queue Authority (from tests - this should be the same authority used to initialize the queue)
// In production, this would be derived or fetched from the program
export const QUEUE_AUTHORITY = new PublicKey("11111111111111111111111111111111"); // Placeholder - will be set dynamically

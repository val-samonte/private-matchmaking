import { PublicKey } from "@solana/web3.js";

export const RPS_PROGRAM_ID = new PublicKey("HGddb95QNe62nMU9gB4Ga81PiBxL7ZpeLUtYcXcLWtgR");
export const MATCHMAKING_PROGRAM_ID = new PublicKey("GvJ8sk3SAQfCHVAFdFyadFRsMjDojqWzeVteksAbsTJy");

// Queue ID for our specific game
export const QUEUE_ID = "rps-prod-queue"; 
// Note: In a real app, you'd probably fetch this or have it dynamic. 
// For the demo we hardcoded it in the test, we'll try to match it or create a new one.

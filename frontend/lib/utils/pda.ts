import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  RPS_GAME_PROGRAM_ID,
  DUEL_PROGRAM_ID,
  PLAYER_PROFILE_SEED,
  GAME_SESSION_SEED,
  QUEUE_SEED,
  TENANT_SEED,
  TICKET_SEED,
} from "../constants";

/**
 * Derive Player Profile PDA
 */
export function derivePlayerProfilePda(
  player: PublicKey,
  programId: PublicKey = RPS_GAME_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PLAYER_PROFILE_SEED), player.toBuffer()],
    programId
  );
}

/**
 * Derive Game Session PDA
 */
export function deriveGameSessionPda(
  player1: PublicKey,
  player2: PublicKey,
  gameId: BN,
  programId: PublicKey = RPS_GAME_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(GAME_SESSION_SEED),
      player1.toBuffer(),
      player2.toBuffer(),
      gameId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

/**
 * Derive Queue PDA
 */
export function deriveQueuePda(
  authority: PublicKey,
  programId: PublicKey = DUEL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(QUEUE_SEED), authority.toBuffer()],
    programId
  );
}

/**
 * Derive Tenant PDA
 */
export function deriveTenantPda(
  authority: PublicKey,
  programId: PublicKey = DUEL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TENANT_SEED), authority.toBuffer()],
    programId
  );
}

/**
 * Derive MatchTicket PDA
 */
export function deriveTicketPda(
  player: PublicKey,
  tenant: PublicKey,
  programId: PublicKey = DUEL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TICKET_SEED), player.toBuffer(), tenant.toBuffer()],
    programId
  );
}

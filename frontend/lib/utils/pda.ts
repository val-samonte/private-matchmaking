import {
  getProgramDerivedAddress,
  getAddressEncoder,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";
import {
  RPS_GAME_PROGRAM_ID,
  DUEL_PROGRAM_ID,
  PLAYER_PROFILE_SEED,
  GAME_SESSION_SEED,
  QUEUE_SEED,
  TENANT_SEED,
  TICKET_SEED,
} from "../constants";

const addressEncoder = getAddressEncoder();
const utf8Encoder = getUtf8Encoder();

/**
 * Derive Player Profile PDA
 */
export async function derivePlayerProfilePda(
  player: Address,
  programId: Address = RPS_GAME_PROGRAM_ID
) {
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8Encoder.encode(PLAYER_PROFILE_SEED), addressEncoder.encode(player)],
  });
}

/**
 * Derive Game Session PDA
 */
export async function deriveGameSessionPda(
  player1: Address,
  player2: Address,
  gameId: bigint,
  programId: Address = RPS_GAME_PROGRAM_ID
) {
  // gameId as little-endian u64 (8 bytes)
  const gameIdBytes = new Uint8Array(8);
  let n = gameId;
  for (let i = 0; i < 8; i++) {
    gameIdBytes[i] = Number(n & BigInt(0xff));
    n >>= BigInt(8);
  }
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      utf8Encoder.encode(GAME_SESSION_SEED),
      addressEncoder.encode(player1),
      addressEncoder.encode(player2),
      gameIdBytes,
    ],
  });
}

/**
 * Derive Queue PDA
 */
export async function deriveQueuePda(
  authority: Address,
  programId: Address = DUEL_PROGRAM_ID
) {
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8Encoder.encode(QUEUE_SEED), addressEncoder.encode(authority)],
  });
}

/**
 * Derive Tenant PDA
 */
export async function deriveTenantPda(
  authority: Address,
  programId: Address = DUEL_PROGRAM_ID
) {
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [utf8Encoder.encode(TENANT_SEED), addressEncoder.encode(authority)],
  });
}

/**
 * Derive MatchTicket PDA
 */
export async function deriveTicketPda(
  player: Address,
  tenant: Address,
  programId: Address = DUEL_PROGRAM_ID
) {
  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      utf8Encoder.encode(TICKET_SEED),
      addressEncoder.encode(player),
      addressEncoder.encode(tenant),
    ],
  });
}

import {
  createSolanaRpc,
  type Address,
  type TransactionSigner,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  getCreateTicketInstructionAsync,
  getDelegateTicketInstructionAsync,
  getJoinQueueInstructionAsync,
  getCancelTicketInstructionAsync,
  getCloseTicketInstructionAsync,
  fetchMaybeMatchTicket,
  accountType,
} from "./generated/duel/index.js";
import { sendInstruction } from "./transaction.js";
import * as utils from "./utils.js";

const DUEL_PROGRAM_ID = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X" as Address;

export class MatchmakingPlayer {
  public rpc: Rpc<SolanaRpcApi>;
  public signer: TransactionSigner;
  public programId: Address;

  constructor(
    rpc: Rpc<SolanaRpcApi>,
    signer: TransactionSigner,
    programId: Address = DUEL_PROGRAM_ID,
  ) {
    this.rpc = rpc;
    this.signer = signer;
    this.programId = programId;
  }

  async getTicketPda(player: Address, tenant: Address): Promise<Address> {
    return utils.deriveTicketPda(this.programId, player, tenant);
  }

  async getTicket(ticketPda: Address) {
    return fetchMaybeMatchTicket(this.rpc, ticketPda);
  }

  async createTicket(tenant: Address): Promise<string> {
    const ix = await getCreateTicketInstructionAsync({
      player: this.signer,
      tenant,
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  async delegateTicket(
    player: Address,
    tenant: Address,
    validator?: Address,
  ): Promise<string> {
    const ticketPda = await this.getTicketPda(player, tenant);
    const ix = await getDelegateTicketInstructionAsync({
      pda: ticketPda,
      payer: this.signer,
      validator,
      accountType: accountType("Ticket", { player, tenant }),
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  async joinQueue(
    queue: Address,
    tenant: Address,
    playerData: Address,
  ): Promise<string> {
    const ix = await getJoinQueueInstructionAsync({
      queue,
      tenant,
      playerData,
      signer: this.signer,
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  async cancelTicket(tenant: Address): Promise<string> {
    const ix = await getCancelTicketInstructionAsync({
      player: this.signer,
      tenant,
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  async closeTicket(tenant: Address): Promise<string> {
    const ix = await getCloseTicketInstructionAsync({
      player: this.signer,
      tenant,
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  /**
   * Poll L1 for ticket status.
   * Returns match info when status becomes Matched.
   */
  async pollForMatch(
    ticketPda: Address,
    maxAttempts = 60,
    pollInterval = 2000,
    signal?: AbortSignal,
  ): Promise<{ opponent: Address; matchId: bigint } | null> {
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) return null;
      await new Promise((r) => setTimeout(r, pollInterval));
      try {
        const maybeTicket = await fetchMaybeMatchTicket(this.rpc, ticketPda);
        if (!maybeTicket.exists) continue;
        const status = maybeTicket.data.status;
        if (status.__kind === "Matched") {
          return { opponent: status.opponent, matchId: status.matchId };
        }
      } catch {
        // Ignore decode errors during transition
      }
    }
    return null;
  }

  /** Create a new MatchmakingPlayer pointing at a TEE RPC endpoint. */
  withRpc(teeUrl: string): MatchmakingPlayer {
    return new MatchmakingPlayer(createSolanaRpc(teeUrl), this.signer, this.programId);
  }
}

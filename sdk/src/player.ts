import {
  createSolanaRpc,
  AccountRole,
  type Address,
  type TransactionSigner,
  type Rpc,
  type SolanaRpcApi,
  type Instruction,
} from "@solana/kit";
import {
  getCreateTicketInstructionAsync,
  getDelegateTicketInstructionAsync,
  getSetupTicketPermissionInstructionAsync,
  getJoinQueueInstructionAsync,
  getCancelTicketInstructionAsync,
  getCloseTicketInstructionAsync,
  fetchMaybeMatchTicket,
  accountType,
} from "./generated/duel/index.js";
import { sendInstruction, sendInstructions } from "./transaction.js";
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
      player: this.signer.address, // Address: real player for PDA seeds
      signer: this.signer,         // TransactionSigner: actual signing key
      payer: this.signer,          // TransactionSigner: fee payer (same in SDK/test env)
      tenant,
      // sessionToken omitted → resolve_player returns signer directly
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
    callbackProgram?: Address,
  ): Promise<string> {
    const ix = await getJoinQueueInstructionAsync({
      queue,
      tenant,
      playerData,
      player: this.signer.address, // Address: real player for ticket seeds
      signer: this.signer,         // TransactionSigner: signing key
      // sessionToken omitted → resolve_player returns signer directly
    }, { programAddress: this.programId });
    const ixFinal = callbackProgram
      ? { ...ix, accounts: [...ix.accounts, { address: callbackProgram, role: 0 as const }] }
      : ix;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sendInstruction(this.rpc, ixFinal as any, this.signer);
  }

  async cancelTicket(tenant: Address): Promise<string> {
    const ix = await getCancelTicketInstructionAsync({
      player: this.signer.address, // Address: real player for PDA seeds
      signer: this.signer,         // TransactionSigner: signing key
      tenant,
      // sessionToken omitted → resolve_player returns signer directly
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  async closeTicket(tenant: Address): Promise<string> {
    const ix = await getCloseTicketInstructionAsync({
      player: this.signer.address, // Address: real player (receives rent)
      signer: this.signer,         // TransactionSigner: signing key
      tenant,
      // sessionToken omitted → resolve_player returns signer directly
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

  /**
   * High-level: full matchmaking TEE entry flow.
   * Creates ticket on L1, sets up permission PDA (so only player + queue authority can read it),
   * delegates the permission PDA and ticket to TEE, then joins the queue.
   * Use individual methods (createTicket, delegateTicket, joinQueue) as escape hatches if needed.
   */
  async enterQueue(
    tenant: Address,
    queue: Address,
    playerData: Address,
    teeRpc: Rpc<SolanaRpcApi>,
    teeUrlWithToken: string,
    validator?: Address,
    callbackProgram?: Address,
  ): Promise<Address> {
    const player = this.signer.address as Address;
    const ticketPda = await this.getTicketPda(player, tenant);

    // Derive all PDAs upfront so both batched TXs can be built in parallel
    const permissionPda = await utils.derivePermissionPda(ticketPda);
    const { delegationBuffer, delegationRecord, delegationMetadata } =
      await utils.derivePermissionDelegationPdas(permissionPda);

    // TX A (1 wallet approval): createTicket + setupPermission
    // createTicket init-s the PDA; setupPermission CPIs into it — valid in one TX.
    const createIx = await getCreateTicketInstructionAsync({
      player: this.signer.address, // Address: real player for PDA seeds
      signer: this.signer,         // TransactionSigner: signing key
      payer: this.signer,          // TransactionSigner: fee payer (same in SDK/test env)
      tenant,
      // sessionToken omitted → resolve_player returns signer directly
    }, { programAddress: this.programId });
    const setupIx = await getSetupTicketPermissionInstructionAsync({
      player: this.signer.address,
      signer: this.signer,
      payer: this.signer,
      tenant,
      permission: permissionPda,
      permissionProgram: utils.PERMISSION_PROGRAM,
      sessionKey: null, // no session key in direct-wallet mode → only player + queue_authority in members
    }, { programAddress: this.programId });
    await sendInstructions(this.rpc, [createIx, setupIx], this.signer);

    // TX B (1 wallet approval): delegatePermission + delegateTicket
    // Both are independent delegation calls; batching saves one round-trip.
    const delegatePermIx: Instruction = {
      programAddress: utils.PERMISSION_PROGRAM,
      data: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]),
      accounts: [
        { address: this.signer.address, role: AccountRole.WRITABLE_SIGNER },
        { address: this.signer.address, role: AccountRole.READONLY_SIGNER },
        { address: ticketPda, role: AccountRole.READONLY },
        { address: permissionPda, role: AccountRole.WRITABLE },
        { address: "11111111111111111111111111111111" as Address, role: AccountRole.READONLY },
        { address: utils.PERMISSION_PROGRAM, role: AccountRole.READONLY },
        { address: delegationBuffer, role: AccountRole.WRITABLE },
        { address: delegationRecord, role: AccountRole.WRITABLE },
        { address: delegationMetadata, role: AccountRole.WRITABLE },
        { address: utils.DELEGATION_PROGRAM, role: AccountRole.READONLY },
        ...(validator ? [{ address: validator, role: AccountRole.READONLY }] : []),
      ],
    };
    const delegateTicketIx = await getDelegateTicketInstructionAsync({
      pda: ticketPda,
      payer: this.signer,
      validator,
      accountType: accountType("Ticket", { player, tenant }),
    }, { programAddress: this.programId });
    await sendInstructions(this.rpc, [delegatePermIx, delegateTicketIx as Instruction], this.signer);

    // TX C (TEE): joinQueue (player = self, signer = self)
    const teeClient = new MatchmakingPlayer(teeRpc, this.signer, this.programId);
    await teeClient.joinQueue(queue, tenant, playerData, callbackProgram);
    // Note: joinQueue now uses player: this.signer.address and signer: this.signer internally

    return ticketPda;
  }

  /** Create a new MatchmakingPlayer pointing at a TEE RPC endpoint. */
  withRpc(teeUrl: string): MatchmakingPlayer {
    return new MatchmakingPlayer(createSolanaRpc(teeUrl), this.signer, this.programId);
  }
}

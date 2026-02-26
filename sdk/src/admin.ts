import {
  createSolanaRpc,
  type Address,
  type TransactionSigner,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  getInitializeTenantInstructionAsync,
  getInitializeQueueInstructionAsync,
  getDelegateQueueInstructionAsync,
  getFlushMatchesInstruction,
  getCommitTicketsInstruction,
  fetchQueue,
  accountType,
} from "./generated/duel/index.js";
import { sendInstruction } from "./transaction.js";
import * as utils from "./utils.js";

export type EloDataType = "u8" | "u16" | "u32" | "u64";

export interface InitializeTenantOptions {
  authority?: Address;
  eloWindow?: bigint;
  eloOffset?: number;
  eloDataType?: EloDataType;
  callbackProgramId?: Address | null;
  callbackDiscriminator?: number[] | null;
}

function getEloSize(dataType: EloDataType): number {
  switch (dataType) {
    case "u8": return 1;
    case "u16": return 2;
    case "u32": return 4;
    case "u64": return 8;
  }
}

const DUEL_PROGRAM_ID = "EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X" as Address;

export class MatchmakingAdmin {
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

  async getQueuePda(authority: Address): Promise<Address> {
    return utils.deriveQueuePda(this.programId, authority);
  }

  async getTenantPda(authority: Address): Promise<Address> {
    return utils.deriveTenantPda(this.programId, authority);
  }

  async getTicketPda(player: Address, tenant: Address): Promise<Address> {
    return utils.deriveTicketPda(this.programId, player, tenant);
  }

  async getQueue(queuePda: Address) {
    return fetchQueue(this.rpc, queuePda);
  }

  async initializeTenant(
    tenantProgramId: Address,
    options?: InitializeTenantOptions,
  ): Promise<string> {
    const {
      eloWindow = 100n,
      eloOffset = 40,
      eloDataType = "u16",
      callbackProgramId = null,
      callbackDiscriminator = null,
    } = options || {};

    const eloSize = getEloSize(eloDataType);
    const ix = await getInitializeTenantInstructionAsync({
      authority: this.signer,
      tenantProgramId,
      eloOffset,
      eloSize,
      eloWindow,
      callbackProgramId: callbackProgramId ? { __option: "Some", value: callbackProgramId } : { __option: "None" },
      callbackDiscriminator: callbackDiscriminator
        ? { __option: "Some", value: new Uint8Array(callbackDiscriminator) }
        : { __option: "None" },
    }, { programAddress: this.programId });

    return sendInstruction(this.rpc, ix, this.signer);
  }

  async initializeQueue(
    _authority: Address,
    tenant: Address,
  ): Promise<string> {
    const ix = await getInitializeQueueInstructionAsync({
      authority: this.signer,
      tenant,
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  async delegateQueue(
    authority: Address,
    validator?: Address,
  ): Promise<string> {
    const queuePda = await this.getQueuePda(authority);
    const ix = await getDelegateQueueInstructionAsync({
      pda: queuePda,
      payer: this.signer,
      validator,
      accountType: accountType("Queue", { authority }),
    }, { programAddress: this.programId });
    return sendInstruction(this.rpc, ix, this.signer);
  }

  async flushMatches(
    queue: Address,
    tenant: Address,
    ticketPdas: Address[],
    callbackProgram?: Address,
  ): Promise<string> {
    const ix = getFlushMatchesInstruction({
      queue,
      tenant,
      signer: this.signer,
    }, { programAddress: this.programId });

    const remainingAccounts = [
      ...ticketPdas.map((address) => ({ address, role: 1 as const })),
      ...(callbackProgram ? [{ address: callbackProgram, role: 0 as const }] : []),
    ];

    const ixWithRemaining = {
      ...ix,
      accounts: [...ix.accounts, ...remainingAccounts],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sendInstruction(this.rpc, ixWithRemaining as any, this.signer);
  }

  async commitTickets(
    tenant: Address,
    ticketPdas: Address[],
  ): Promise<string> {
    const ix = getCommitTicketsInstruction({
      tenant,
      payer: this.signer,
    }, { programAddress: this.programId });

    const ixWithRemaining = {
      ...ix,
      accounts: [
        ...ix.accounts,
        ...ticketPdas.map((address) => ({ address, role: 1 as const })),
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sendInstruction(this.rpc, ixWithRemaining as any, this.signer);
  }

  /** Create a new MatchmakingAdmin pointing at a TEE RPC endpoint. */
  withRpc(teeUrl: string): MatchmakingAdmin {
    return new MatchmakingAdmin(createSolanaRpc(teeUrl), this.signer, this.programId);
  }
}

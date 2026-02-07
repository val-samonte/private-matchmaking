import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import * as web3 from "@solana/web3.js";
import type { Duel } from "./types.js";
import { createRequire } from "module";
const IDL = createRequire(import.meta.url)("./duel.json");
import * as utils from "./utils.js";

const TICKET_SEED = "ticket";

export type EloDataType = 'u8' | 'u16' | 'u32' | 'u64';

export interface InitializeTenantOptions {
  authority?: web3.PublicKey;
  eloWindow?: number;
  eloOffset?: number;
  eloDataType?: EloDataType;
  callbackProgramId?: web3.PublicKey | null;
  callbackDiscriminator?: number[] | null;
}

function getEloSize(dataType: EloDataType): number {
  switch (dataType) {
    case 'u8': return 1;
    case 'u16': return 2;
    case 'u32': return 4;
    case 'u64': return 8;
  }
}

export class MatchmakingAdmin {
  public program: anchor.Program<Duel>;
  public provider: anchor.AnchorProvider;

  constructor(provider: anchor.AnchorProvider, programId: web3.PublicKey | string) {
    const address = typeof programId === "string" ? programId : programId.toBase58();
    const idl = { ...IDL, address };
    this.program = new anchor.Program(idl as any, provider);
    this.provider = provider;
  }

  // Derive PDAs Helpers
  getQueuePda(authority: web3.PublicKey): web3.PublicKey {
    return utils.deriveQueuePda(this.program.programId, authority);
  }

  getTenantPda(authority: web3.PublicKey): web3.PublicKey {
    return utils.deriveTenantPda(this.program.programId, authority);
  }

  getTicketPda(player: web3.PublicKey, tenant: web3.PublicKey): web3.PublicKey {
    return utils.deriveTicketPda(this.program.programId, player, tenant);
  }

  /**
   * Fetch Queue account data
   */
  async getQueue(queuePda: web3.PublicKey): Promise<any> {
    return await this.program.account.queue.fetch(queuePda);
  }

  /**
   * Fetch Tenant account data
   */
  async getTenant(tenantPda: web3.PublicKey): Promise<any> {
    return await this.program.account.tenant.fetch(tenantPda);
  }

  /**
   * Initialize a Tenant (with optional callback config)
   */
  async initializeTenant(
    tenantProgramId: web3.PublicKey,
    options?: InitializeTenantOptions,
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
    const {
      authority = tenantProgramId,
      eloWindow = 100,
      eloOffset = 40,
      eloDataType = 'u16',
      callbackProgramId = null,
      callbackDiscriminator = null,
    } = options || {};

    const eloSize = getEloSize(eloDataType);
    const tenantPda = this.getTenantPda(authority);

    return await this.program.methods
      .initializeTenant(
        tenantProgramId,
        eloOffset,
        eloSize,
        new BN(eloWindow),
        callbackProgramId || null,
        callbackDiscriminator ? Array.from(Buffer.from(callbackDiscriminator)) : null
      )
      .accountsPartial({
        tenant: tenantPda,
        authority: authority,
      })
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Initialize a Queue
   */
  async initializeQueue(
    authority: web3.PublicKey,
    tenant: web3.PublicKey,
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
    const queuePda = this.getQueuePda(authority);
    return await this.program.methods
      .initializeQueue()
      .accountsPartial({
        queue: queuePda,
        tenant: tenant,
        authority: authority,
      })
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Delegate Queue to TEE
   */
  async delegateQueue(
    authority: web3.PublicKey,
    validator: web3.PublicKey = new web3.PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
      const queuePda = this.getQueuePda(authority);
      return await this.program.methods
        .delegateQueue({ queue: { authority } } as any)
        .accounts({
            pda: queuePda,
            payer: authority,
            validator: validator,
        } as unknown as any)
        .signers(signers)
        .rpc(confirmOptions);
  }

  /**
   * Flush pending matches - crank instruction to update opponent tickets
   * Can be called by any TEE-authenticated wallet (permissionless)
   */
  async flushMatches(
    queue: web3.PublicKey,
    tenant: web3.PublicKey,
    ticketPdas: web3.PublicKey[],
    callbackProgram?: web3.PublicKey,
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
    const remainingAccounts = ticketPdas.map(pda => ({
      pubkey: pda,
      isSigner: false,
      isWritable: true,
    }));

    if (callbackProgram) {
      remainingAccounts.push({
        pubkey: callbackProgram,
        isSigner: false,
        isWritable: false,
      });
    }

    return await this.program.methods
      .flushMatches()
      .accountsPartial({
        queue: queue,
        tenant: tenant,
        signer: this.provider.publicKey,
      })
      .remainingAccounts(remainingAccounts)
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Commit matched tickets back to L1 (runs in TEE)
   */
  async commitTickets(
    tenant: web3.PublicKey,
    ticketPdas: web3.PublicKey[],
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
    return await this.program.methods
      .commitTickets()
      .accountsPartial({
        tenant: tenant,
        payer: this.provider.publicKey,
      })
      .remainingAccounts(
        ticketPdas.map(pda => ({
          pubkey: pda,
          isSigner: false,
          isWritable: true,
        }))
      )
      .signers(signers)
      .rpc(confirmOptions);
  }
}

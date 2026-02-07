import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionSignature, ConfirmOptions, Keypair } from "@solana/web3.js";
import { Duel } from "./types";
import IDL from "./duel.json";

const TICKET_SEED = "ticket";

export type EloDataType = 'u8' | 'u16' | 'u32' | 'u64';

export interface InitializeTenantOptions {
  authority?: PublicKey;
  eloWindow?: number;
  eloOffset?: number;
  eloDataType?: EloDataType;
  callbackProgramId?: PublicKey | null;
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
  program: Program<Duel>;
  provider: AnchorProvider;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.provider = provider;
    const PROGRAM_ID = programId || new PublicKey("EdZzUwKd1X2ZWjxLPpz1cpEzMF7RUZC43Pq64v1VcK5X");

    // Override address in IDL
    const modifiedIdl = { ...IDL } as any;
    modifiedIdl.address = PROGRAM_ID.toBase58();

    this.program = new Program(modifiedIdl, this.provider);
  }

  // Derive PDAs Helpers
  getQueuePda(authority: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("queue"), authority.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  getTenantPda(authority: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tenant"), authority.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  getTicketPda(player: PublicKey, tenant: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(TICKET_SEED), player.toBuffer(), tenant.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  /**
   * Initialize a Tenant (with optional callback config)
   */
  async initializeTenant(
    tenantProgramId: PublicKey,
    options?: InitializeTenantOptions,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
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
        new anchor.BN(eloWindow),
        callbackProgramId || null,
        callbackDiscriminator ? Buffer.from(callbackDiscriminator) : null
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
    authority: PublicKey,
    tenant: PublicKey,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
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
    authority: PublicKey,
    validator: PublicKey = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
      const queuePda = this.getQueuePda(authority);
      return await this.program.methods
        .delegateQueue({ queue: { authority } } as any)
        .accounts({
            pda: queuePda,
            payer: authority,
            validator: validator,
        } as any)
        .signers(signers)
        .rpc(confirmOptions);
  }

  /**
   * Flush pending matches - crank instruction to update opponent tickets
   * Can be called by any TEE-authenticated wallet (permissionless)
   */
  async flushMatches(
    queue: PublicKey,
    tenant: PublicKey,
    ticketPdas: PublicKey[],
    callbackProgram?: PublicKey,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
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
    tenant: PublicKey,
    ticketPdas: PublicKey[],
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
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

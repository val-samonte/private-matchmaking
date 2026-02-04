import * as anchor from "@coral-xyz/anchor";
import { Program, Idl, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionSignature, ConfirmOptions, Keypair } from "@solana/web3.js";
import { PrivateMatchmaking } from "./types";
import IDL from "./private_matchmaking.json";

// Re-export types
export { PrivateMatchmaking };

export class MatchmakingClient {
  program: Program<PrivateMatchmaking>;
  provider: AnchorProvider;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.provider = provider;
    const PROGRAM_ID = programId || new PublicKey("sUcFSbEig6ydu7ddNhb1dvRksqmC5eRuLxg77wK4PDz");
    
    // Override address in IDL
    const modifiedIdl = { ...IDL } as any;
    modifiedIdl.address = PROGRAM_ID.toBase58();
    
    this.program = new Program(modifiedIdl, this.provider);
  }

  /**
   * Derive the Queue PDA
   */
  getQueuePda(authority: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("queue"), authority.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  /**
   * Derive the Tenant PDA
   */
  getTenantPda(authority: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tenant"), authority.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  /**
   * Initialize a Tenant
   */
  async initializeTenant(
    authority: PublicKey,
    tenantProgramId: PublicKey,
    eloWindow: number = 100,
    eloOffset: number = 8 + 32,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
    const tenantPda = this.getTenantPda(authority);
    return await this.program.methods
      .initializeTenant(
        tenantProgramId,
        eloOffset,
        new anchor.BN(eloWindow)
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
    validator: PublicKey = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"), // Default Reference Validator
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
      const queuePda = this.getQueuePda(authority);
      // Construct manual accounts for delegation if IDL doesn't fully support delegate macro typing in old versions
      // But typically it should.
      return await this.program.methods
        .delegateQueue({ queue: { authority } } as any) // enum argument
        .accounts({
            pda: queuePda,
            payer: authority,
            validator: validator,
        } as any)
        .signers(signers)
        .rpc(confirmOptions);
  }

  /**
   * Join Queue (TEE Aware)
   */
  async joinQueue(
    queue: PublicKey,
    tenant: PublicKey,
    playerData: PublicKey,
    confirmOptions?: ConfirmOptions
  ): Promise<TransactionSignature> {
    return await this.program.methods
      .joinQueue()
      .accountsPartial({
        queue: queue,
        tenant: tenant,
        playerData: playerData,
        signer: this.provider.publicKey, // Explicit signer from provider
      })
      .rpc(confirmOptions);
  }

  /**
   * Process Match
   */
  async processMatch(
    queue: PublicKey,
    tenant: PublicKey,
    confirmOptions?: ConfirmOptions
  ): Promise<TransactionSignature> {
    return await this.program.methods
      .processMatch()
      .accountsPartial({
        queue: queue,
        tenant: tenant,
      })
      .rpc(confirmOptions);
  }
}

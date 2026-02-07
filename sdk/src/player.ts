import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionSignature, ConfirmOptions, Keypair, Connection, AccountInfo } from "@solana/web3.js";
import { Duel } from "./types";
import IDL from "./duel.json";

const TICKET_SEED = "ticket";

export class MatchmakingPlayer {
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

  /**
   * Derive MatchTicket PDA
   */
  getTicketPda(player: PublicKey, tenant: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(TICKET_SEED), player.toBuffer(), tenant.toBuffer()],
      this.program.programId
    );
    return pda;
  }

  /**
   * Create MatchTicket PDA on L1
   */
  async createTicket(
    tenant: PublicKey,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
    const ticketPda = this.getTicketPda(this.provider.publicKey, tenant);
    return await this.program.methods
      .createTicket()
      .accountsPartial({
        ticket: ticketPda,
        tenant: tenant,
        player: this.provider.publicKey,
      })
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Delegate ticket into TEE (becomes invisible on L1)
   */
  async delegateTicket(
    player: PublicKey,
    tenant: PublicKey,
    validator: PublicKey = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
    const ticketPda = this.getTicketPda(player, tenant);
    return await this.program.methods
      .delegateTicket({ ticket: { player, tenant } } as any)
      .accounts({
        pda: ticketPda,
        payer: this.provider.publicKey,
        validator: validator,
      } as any)
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Join Queue (TEE Aware) - now requires ticket
   */
  async joinQueue(
    queue: PublicKey,
    tenant: PublicKey,
    playerData: PublicKey,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
    const ticketPda = this.getTicketPda(this.provider.publicKey, tenant);
    return await this.program.methods
      .joinQueue()
      .accountsPartial({
        queue: queue,
        tenant: tenant,
        playerData: playerData,
        playerTicket: ticketPda,
        signer: this.provider.publicKey,
      })
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Cancel search, marks ticket as Cancelled (runs in TEE)
   */
  async cancelTicket(
    tenant: PublicKey,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
    const ticketPda = this.getTicketPda(this.provider.publicKey, tenant);
    return await this.program.methods
      .cancelTicket()
      .accountsPartial({
        ticket: ticketPda,
        tenant: tenant,
        player: this.provider.publicKey,
      })
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Close ticket and reclaim rent (L1, after match consumed or cancelled)
   */
  async closeTicket(
    tenant: PublicKey,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
    const ticketPda = this.getTicketPda(this.provider.publicKey, tenant);
    return await this.program.methods
      .closeTicket()
      .accountsPartial({
        ticket: ticketPda,
        tenant: tenant,
        player: this.provider.publicKey,
      })
      .signers(signers)
      .rpc(confirmOptions);
  }

  /**
   * Wait for match by subscribing to ticket PDA changes on L1.
   * Returns match info when ticket status changes to Matched.
   */
  async waitForMatch(
    ticketPda: PublicKey,
    connection: Connection,
    timeoutMs: number = 120000
  ): Promise<{ opponent: PublicKey; matchId: anchor.BN } | null> {
    return new Promise((resolve, reject) => {
      let subscriptionId: number | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (subscriptionId !== null) {
          connection.removeAccountChangeListener(subscriptionId);
        }
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      // Subscribe to account changes on L1
      subscriptionId = connection.onAccountChange(
        ticketPda,
        (accountInfo: AccountInfo<Buffer>) => {
          try {
            const decoded = this.program.coder.accounts.decode(
              "matchTicket",
              accountInfo.data
            );
            if (decoded.status.matched) {
              cleanup();
              resolve({
                opponent: decoded.status.matched.opponent,
                matchId: decoded.status.matched.matchId,
              });
            }
          } catch (e) {
            // Ignore decode errors (account may be in transition)
          }
        },
        "confirmed"
      );
    });
  }

  /**
   * Poll L1 for ticket status (fallback for environments without websocket)
   */
  async pollForMatch(
    ticketPda: PublicKey,
    connection: Connection,
    maxAttempts: number = 60,
    pollInterval: number = 2000,
    signal?: AbortSignal
  ): Promise<{ opponent: PublicKey; matchId: anchor.BN } | null> {
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) return null;

      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const accountInfo = await connection.getAccountInfo(ticketPda);
        if (!accountInfo) continue;

        const decoded = this.program.coder.accounts.decode(
          "matchTicket",
          accountInfo.data
        );

        if (decoded.status.matched) {
          return {
            opponent: decoded.status.matched.opponent,
            matchId: decoded.status.matched.matchId,
          };
        }
      } catch (e) {
        // Account may not exist yet or be in transition
      }
    }
    return null;
  }
}

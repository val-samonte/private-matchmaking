import * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import type { Duel } from "./types.ts";
import { createRequire } from "module";
const IDL = createRequire(import.meta.url)("./duel.json");
import * as utils from "./utils.ts";

export class MatchmakingPlayer {
  public program: anchor.Program<Duel>;
  public provider: anchor.AnchorProvider;

  constructor(provider: anchor.AnchorProvider, programId: web3.PublicKey | string) {
    const address = typeof programId === "string" ? programId : programId.toBase58();
    const idl = { ...IDL, address };
    this.program = new anchor.Program(idl as any, provider);
    this.provider = provider;
  }

  /**
   * Derive MatchTicket PDA
   */
  getTicketPda(player: web3.PublicKey, tenant: web3.PublicKey): web3.PublicKey {
    return utils.deriveTicketPda(this.program.programId, player, tenant);
  }

  /**
   * Create MatchTicket PDA on L1
   */
  async createTicket(
    tenant: web3.PublicKey,
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
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
    player: web3.PublicKey,
    tenant: web3.PublicKey,
    validator: web3.PublicKey = new web3.PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"),
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
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
    queue: web3.PublicKey,
    tenant: web3.PublicKey,
    playerData: web3.PublicKey,
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
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
    tenant: web3.PublicKey,
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
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
    tenant: web3.PublicKey,
    confirmOptions?: web3.ConfirmOptions,
    signers: web3.Keypair[] = []
  ): Promise<web3.TransactionSignature> {
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
    ticketPda: web3.PublicKey,
    connection: web3.Connection,
    timeoutMs: number = 120000
  ): Promise<{ opponent: web3.PublicKey; matchId: anchor.BN } | null> {
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
        (accountInfo: web3.AccountInfo<Buffer>) => {
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
    ticketPda: web3.PublicKey,
    connection: web3.Connection,
    maxAttempts: number = 60,
    pollInterval: number = 2000,
    signal?: AbortSignal
  ): Promise<{ opponent: web3.PublicKey; matchId: anchor.BN } | null> {
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

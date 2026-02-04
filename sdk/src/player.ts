import * as anchor from "@coral-xyz/anchor";
import { Program, Idl, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionSignature, ConfirmOptions, Keypair } from "@solana/web3.js";
import { Duel } from "./types";
import IDL from "./duel.json";

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
   * Join Queue (TEE Aware)
   */
  async joinQueue(
    queue: PublicKey,
    tenant: PublicKey,
    playerData: PublicKey,
    confirmOptions?: ConfirmOptions,
    signers: Keypair[] = []
  ): Promise<TransactionSignature> {
    return await this.program.methods
      .joinQueue()
      .accountsPartial({
        queue: queue,
        tenant: tenant,
        playerData: playerData,
        signer: this.provider.publicKey,
      })
      .signers(signers)
      .rpc(confirmOptions);
  }
}

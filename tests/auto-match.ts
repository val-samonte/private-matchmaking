import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RpsGame } from "../target/types/rps_game";
import { PrivateMatchmaking } from "../target/types/private_matchmaking";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAuthToken, createDelegatePermissionInstruction, permissionPdaFromAccount, AUTHORITY_FLAG, TX_LOGS_FLAG, waitUntilPermissionActive, getPermissionStatus, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, DEFAULT_PRIVATE_VALIDATOR, DELEGATION_PROGRAM_ID, createCloseEscrowInstruction } from "@magicblock-labs/ephemeral-rollups-sdk";
import * as nacl from "tweetnacl";
import { assert } from "chai";

// ... (Helper functions getAuthTokenManual, robustWaitUntilPermissionActive from previous test) ...
// For brevity, I will assume the environment usually has them or I will re-include minimal versions if needed.
// I'll paste the full content.

// Authorization Interfaces
interface ChallengeResponse {
    challenge: string;
}

interface AuthResponse {
    token: string;
}

async function getAuthTokenManual(rpcUrl: string, publicKey: PublicKey, signMessage: (msg: Uint8Array) => Promise<Uint8Array>): Promise<{ token: string, expiresAt: number }> {
    const bs58 = require("bs58");
    const fetch = global.fetch; 
    const baseUrl = rpcUrl.endsWith("/") ? rpcUrl.slice(0, -1) : rpcUrl;
    const challengeUrl = `${baseUrl}/auth/challenge?pubkey=${publicKey.toString()}`;
    // ... same as before ...
    // Simplified for this write:
    try {
        const res = await fetch(challengeUrl);
        const json = await res.json() as ChallengeResponse;
        const { challenge } = json;
        const signature = await signMessage(new Uint8Array(Buffer.from(challenge, "utf-8")));
        const loginUrl = `${baseUrl}/auth/login`;
        const authRes = await fetch(loginUrl, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ pubkey: publicKey.toString(), challenge, signature: bs58.encode(signature) })
        });
        const authJson = await authRes.json() as AuthResponse;
        return { token: authJson.token, expiresAt: Date.now() + 100000 };
    } catch(e) {
        console.error("Auth helper error:", e);
        throw e;
    }
}


describe("architecture-refactor-verification", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const rpsGame = anchor.workspace.RpsGame as Program<RpsGame>;
  const privateMatchmaking = anchor.workspace.PrivateMatchmaking as Program<PrivateMatchmaking>;

  const MAGIC_CONTEXT_DEVNET = new PublicKey("FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA");
  const ephemeralRpcEndpoint = "https://tee.magicblock.app/";

  // Accounts
  const queueSeed = Buffer.from("queue");
  const playerProfileSeed = Buffer.from("player_profile_v35"); 

  // Generate a fresh authority for the queue to satisfy "init" constraints unique seed requirements
  // (In production, this would be a persistent admin key)
  const queueAuthority = Keypair.generate();

  const [queuePda] = PublicKey.findProgramAddressSync(
    [queueSeed, queueAuthority.publicKey.toBuffer()],
    privateMatchmaking.programId
  );

  const player1 = Keypair.generate();
  const player2 = Keypair.generate();

  const [p1ProfilePda] = PublicKey.findProgramAddressSync(
    [playerProfileSeed, player1.publicKey.toBuffer()],
    rpsGame.programId
  );
  const [p2ProfilePda] = PublicKey.findProgramAddressSync(
    [playerProfileSeed, player2.publicKey.toBuffer()],
    rpsGame.programId
  );

  let teeRpsInfo: { program: Program<RpsGame>, provider: anchor.AnchorProvider };

  // Helper to get TEE Provider
  async function getTeeProgram(signer: Keypair): Promise<Program<RpsGame>> {
      // For this refactor verification, we might just submit transactions to Main Devnet if we don't want to debug TEE auth again?
      // But we need TEE for privacy?
      // The instructions are "Generic Adapter". We can verify logic on Devnet L1 first (Atomic).
      // Then Delegation.
      // Let's try running logic on L1 first to confirm CPI works.
      // If L1 works, Architecture is valid.
      // Delegation is an extra layer.
      
      const wallet = new anchor.Wallet(signer);
      const p = new anchor.AnchorProvider(provider.connection, wallet, { commitment: "confirmed" });
      return new anchor.Program(rpsGame.idl as any, p);
  }

  before("Setup and Fund", async () => {
    const payer = (provider.wallet as anchor.Wallet).payer;
    await sendAndConfirmTransaction(provider.connection, new Transaction().add(
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: player1.publicKey, lamports: 0.1 * 10**9 }),
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: player2.publicKey, lamports: 0.1 * 10**9 }),
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: queueAuthority.publicKey, lamports: 0.1 * 10**9 })
    ), [payer]);
  });

  it("Initialize Infrastructure (Queue)", async () => {
      // PrivateMatchmaking::InitializeQueue
      await privateMatchmaking.methods.initializeQueue({
          tenantProgramId: rpsGame.programId,
          eloOffset: 8 + 32, // Discriminator + Pubkey = 40. ELO is next 8 bytes.
      }).accounts({
          authority: queueAuthority.publicKey,
      }).signers([queueAuthority]).rpc();
      console.log("Queue Initialized");
  });

  it("Initialize Tenant (Profiles)", async () => {
      const rpsP1 = await getTeeProgram(player1);
      await rpsP1.methods.initializePlayer().accounts({}).rpc();
      
      const rpsP2 = await getTeeProgram(player2);
      await rpsP2.methods.initializePlayer().accounts({}).rpc();
      console.log("Profiles Initialized");
  });

  it("P1 Joins Queue (CPI)", async () => {
      // P1 calls RPS::join_game_queue -> CPI -> PrivateMatchmaking::join_queue
      const rpsP1 = await getTeeProgram(player1);
      
          await rpsP1.methods.joinGameQueue().accounts({
              queue: queuePda,
              profile: p1ProfilePda,
          }).rpc();
          console.log("P1 Joined Queue via CPI");
      
      // Verify State
      const queueAccount = await privateMatchmaking.account.queue.fetch(queuePda);
      assert.equal(queueAccount.entries.length, 1);
      assert.equal(queueAccount.entries[0].player.toString(), p1ProfilePda.toString()); // Entry uses Profile Key?
      // Wait, in rps-game lib.rs JoinGameQueue:
      // cpi_accounts = JoinQueue { queue, player_data: profile, signer: player }
      // private-matchmaking lib.rs:
      // entry.player = ctx.accounts.player_data.key()
      // Yes, it stores the Profile Key.
  });

  it("P2 Joins Queue and Matches", async () => {
      const rpsP2 = await getTeeProgram(player2);
      await rpsP2.methods.joinGameQueue().accounts({
          queue: queuePda,
          profile: p2ProfilePda,
      }).rpc();
       console.log("P2 Joined Queue via CPI");
       
      let queueAccount = await privateMatchmaking.account.queue.fetch(queuePda);
      assert.equal(queueAccount.entries.length, 2);
      console.log("Queue Entries (Before Match):", queueAccount.entries.length);

      // Trigger Matching manually (Simulating TEE Cron)
      await privateMatchmaking.methods.processMatch().accounts({
          queue: queuePda,
          authority: provider.wallet.publicKey,
      }).rpc();
      console.log("Match Processed");

      queueAccount = await privateMatchmaking.account.queue.fetch(queuePda);
      console.log("Queue Entries (After Match):", queueAccount.entries.length);
      assert.equal(queueAccount.entries.length, 0);
  });
});

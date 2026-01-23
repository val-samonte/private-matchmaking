import { PublicKey } from "@solana/web3.js";

const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const MATCHMAKING_PROGRAM_ID = new PublicKey("GvJ8sk3SAQfCHVAFdFyadFRsMjDojqWzeVteksAbsTJy"); // Devnet
const RPS_PROGRAM_ID = new PublicKey("HGddb95QNe62nMU9gB4Ga81PiBxL7ZpeLUtYcXcLWtgR"); // Devnet

// Error Log Values
const LEFT = "CfMpt6uohWgBvSnNiXwQexqgqrMNAzpWqwfXtzMz7trH"; // Expected by Program
const RIGHT = "7SYn9CuZTiCNJpuWkqysFwK8xFSoefWr6pLog7Ytv48s"; // Passed by Client

async function main() {
    console.log("Analyzing Seed Mismatch...");

    // 1. Reconstruct Queue PDA
    // We don't know the exact queueId timestamp, but we can try to guess or use the Authority.
    // Queue Authority is deterministic.
    const [queueAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("queue-authority")],
        RPS_PROGRAM_ID
    );
    console.log("Queue Authority:", queueAuthority.toBase58());

    // We can't easily guess Queue PDA without the queueId string. 
    // BUT we can test if "Right" matches the derivation formula we used.
    
    // Reverse Engineering RIGHT (7SYn9...)
    // If Right was derived as ["buffer", QUEUE_KEY] @ DELEGATION_ID
    // We can't confirm without QUEUE_KEY.
    
    // However, LEFT (CfMpt...) is derived by the program.
    // The program used the `queue` account passed to it.
    // The client used the `queue` account passed to it.
    // So both used the SAME Queue Key.
    
    // Therefore, the difference MUST be in the SEEDS or PROGRAM ID.
    
    console.log("\nHypthesis 1: Delegation Program Mismatch?");
    console.log("Client used:", DELEGATION_PROGRAM_ID.toBase58());
    // If Program used a different ID?
    
    console.log("\nHypothesis 2: Seed Prefix Mismatch?");
    // Client used "buffer".
    // Program used "buffer".
    
    console.log("\nHypothesis 3: Encoding Mismatch?");
    
    // Let's assume we have a hypothetical queue Key 'Q'.
    // buffer = find(['buffer', Q], D).
    
    // We have TWO buffers. B_left and B_right.
    // B_left = find(seeds_L, prog_L)
    // B_right = find(seeds_R, prog_R)
    
    // Since B_right was passed in instruction accounts:
    // It was derived by client.
    
    // Since B_left was calculated by program:
    // It uses the `queue` account (pda) key.
    
    // If Queue Key is same (it must be, it's the same account in the slot), 
    // then seeds or program_id differ.
    
    // Is it possible the program thinks the Queue Key is different?
    // No, `pda` is the account.
    
    // What if `DelegateQueue` struct definition in `private-matchmaking` has:
    // seeds = [b"buffer", pda.key().as_ref(), AUTHORITY?]
    // The macro default is just `[b"buffer", pda]`.
    
    console.log("Checking Devnet DELEGATION_PROGRAM_ID matches MagicBlock docs...");
}

main();

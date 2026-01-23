const { PublicKey } = require("@solana/web3.js");

const UNKNOWN_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"); // Devnet Delegation

// Error Log Values
const LEFT = "CfMpt6uohWgBvSnNiXwQexqgqrMNAzpWqwfXtzMz7trH"; // Expected by Program
const RIGHT = "7SYn9CuZTiCNJpuWkqysFwK8xFSoefWr6pLog7Ytv48s"; // Passed by Client

// We suspect Right comes from ["buffer", Q]
// We want to know what Q + Program produced Left.

function findBuffer(queueKey, programId) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from("buffer"), queueKey.toBuffer()],
        programId
    )[0].toBase58();
}

async function main() {
    console.log("Analyzing Seed Mismatch (JS)...");

    // We don't have Queue Key. 
    // BUT we have Right = find("buffer", Q, P_right).
    // If we iterate through common Queue Keys or reverse it? No can't reverse hash.
    
    // However, if we assume Right was generated correctly by valid code:
    // Right = 7SYn9...
    // Program used = DELeGG...
    
    // Can we verify if Left = 7SYn9...? 
    // No, Left != Right.
    
    console.log("Left (Expected):", LEFT);
    console.log("Right (Passed):", RIGHT);
    
    if (LEFT === RIGHT) {
        console.log("MATCH! Wait, why did the error say seeds constraint violated?");
    } else {
        console.log("MISMATCH. Probing for cause...");
    }
    
    // Hypothesis: Program ID mismatch.
    // Maybe Localnet Program ID (Default) was used by the macro?
    // Localnet Delegation default is often different?
    // "Bit..." something?
    
    // Or did we accidentally use the WRONG delegation program ID in the client?
    // Is DELeGG... correct for Devnet?
    // MagicBlock Docs say: DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh
    
    // Maybe the 'queue' key is different?
    // Impossible if we pass the same account.
    
    // Maybe the seed literal changed? "buffer_im" ?
}

main();

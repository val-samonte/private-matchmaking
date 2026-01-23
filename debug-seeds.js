const { PublicKey } = require("@solana/web3.js");

// From Anchor.toml
const MATCHMAKING_PID = new PublicKey("DYDe2VCrFjzxy9zuovGeum67kYybr65G6Zbxt9gPJP1f");
const RPS_PID = new PublicKey("6yDcqjPGroT8SRrANaKaLi5aM6YMJmSwux69Ukm8cqQx");

// Delegation IDs
const DELEGATION_PID_DEVNET = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const DELEGATION_PID_LOCAL = new PublicKey("BitvrRgxeoLsFBLeFxgz4xW28zKDPvBq7B5Wc2rY1t3h"); 

// From Logs
const LOG_LEFT = "Fh68kkXwFDubEdkRRBuWCXBdTr2YtnM52ASA7fxHrbCw";
const LOG_RIGHT = "FmbRjotTFdcQahKcaYuQdxDyzGY85s8Hg6q2fT5Hkagr";

const QUEUE_ID = "rps-ranked-queue-debug-1"; 

function derive(seed, key, pid) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(seed), key.toBuffer()],
        pid
    )[0].toBase58();
}

function main() {
    console.log("Analyzing Seed Mismatch (JS)...");

    const [queueAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("queue-authority")],
        RPS_PID
    );

    const [queuePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("queue-head"), queueAuthorityPda.toBuffer(), Buffer.from(QUEUE_ID)],
        MATCHMAKING_PID
    );

    const [delegationRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation"), queuePda.toBuffer()],
        MATCHMAKING_PID
    );
    const [delegationMetadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation-metadata"), queuePda.toBuffer()],
        MATCHMAKING_PID
    );

    const keys = {
        "QueuePda": queuePda,
        "QueueAuth": queueAuthorityPda,
        "Record": delegationRecordPda,
        "Metadata": delegationMetadataPda,
        "RPS_PID": RPS_PID, 
        "Matchmaking_PID": MATCHMAKING_PID,
    };

    const pids = {
        "Devnet": DELEGATION_PID_DEVNET,
        "Local": DELEGATION_PID_LOCAL,
        "RPS": RPS_PID,
        "Matchmaking": MATCHMAKING_PID,
    };

    const seeds = ["buffer", "delegation", "delegation-metadata", "queue-head", "state", "val"];
    
    const SEARCH_TARGETS = {
        "LEFT": LOG_LEFT,
        "RIGHT": LOG_RIGHT
    };

    console.log("Searching for:", SEARCH_TARGETS);
    
    // Check strict equality first
    for (const [tName, tVal] of Object.entries(SEARCH_TARGETS)) {
        for (const [kName, kVal] of Object.entries(keys)) {
             if (kVal.toBase58() === tVal) { console.log(`MATCH ${tName} == ${kName}`); }
        }
    }
    
    // Brute force derivations
    // Targeted Search
    console.log("--- TARGETED SEARCH ---");
    for (const [pName, pVal] of Object.entries(pids)) {
        for (const [kName, kVal] of Object.entries(keys)) {
            for (const s of seeds) {
                try {
                    const derived = derive(s, kVal, pVal);
                    if (derived === LOG_LEFT) {
                        console.log(`FOUND Fh68kk! => [${pName}] [${kName}] seed="${s}"`);
                    }
                } catch (e) {}
            }
        }
    }
}
main();

import { PublicKey } from "@solana/web3.js";
import { BN, utils } from "@coral-xyz/anchor";
import { Buffer } from "buffer";

export function deriveQueuePda(programId: PublicKey, authority: PublicKey, queueId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode("queue-head"), 
            authority.toBuffer(), 
            utils.bytes.utf8.encode(queueId)
        ],
        programId
    );
    return pda;
}

export function derivePagePda(programId: PublicKey, queue: PublicKey, index: BN | number): PublicKey {
    const idxBn = new BN(index);
    const [pda] = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode("page"), 
            queue.toBuffer(), 
            idxBn.toArrayLike(Buffer, "le", 8)
        ],
        programId
    );
    return pda;
}

export function derivePlayerStatusPda(programId: PublicKey, playerGameAccount: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode("status"), 
            playerGameAccount.toBuffer()
        ],
        programId
    );
    return pda;
}

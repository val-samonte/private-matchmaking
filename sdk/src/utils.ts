import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export function deriveQueuePda(programId: PublicKey, authority: PublicKey, queueId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("queue-head"), authority.toBuffer(), Buffer.from(queueId)],
        programId
    );
    return pda;
}

export function derivePagePda(programId: PublicKey, queue: PublicKey, index: BN | number): PublicKey {
    const idxBn = new BN(index);
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("page"), queue.toBuffer(), idxBn.toArrayLike(Buffer, "le", 8)],
        programId
    );
    return pda;
}

export function derivePlayerStatusPda(programId: PublicKey, playerGameAccount: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("status"), playerGameAccount.toBuffer()],
        programId
    );
    return pda;
}

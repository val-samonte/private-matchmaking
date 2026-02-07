import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export const QUEUE_SEED = "queue";
export const TENANT_SEED = "tenant";
export const TICKET_SEED = "ticket";

export function deriveQueuePda(programId: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey {
    const [pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(QUEUE_SEED), authority.toBuffer()],
        programId
    );
    return pda;
}

export function deriveTenantPda(programId: web3.PublicKey, authority: web3.PublicKey): web3.PublicKey {
    const [pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(TENANT_SEED), authority.toBuffer()],
        programId
    );
    return pda;
}

export function deriveTicketPda(programId: web3.PublicKey, player: web3.PublicKey, tenant: web3.PublicKey): web3.PublicKey {
    const [pda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from(TICKET_SEED), player.toBuffer(), tenant.toBuffer()],
        programId
    );
    return pda;
}

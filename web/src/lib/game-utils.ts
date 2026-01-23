import { PublicKey } from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";
import { RPS_PROGRAM_ID } from "./constants";

export function derivePlayerProfilePda(player: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            utils.bytes.utf8.encode("player_profile"),
            player.toBuffer()
        ],
        RPS_PROGRAM_ID
    );
    return pda;
}

export function deriveGamePda(gameId: string): PublicKey {
    // gameId is u64 in contract, so 8 bytes LE.
    // If passed as string (number), must convert. 
    // Here assuming gameId is passed as string representation of number or we generate a BN.
    // We'll handle BN conversion in the caller usually.
    // But for PDA we need the bytes.
    // This helper might need specific inputs.
    // Let's defer exact implementation until needed by Game component.
// ... existing code ...
    return PublicKey.default;
}

export function deriveQueueAuthorityPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [utils.bytes.utf8.encode("queue-authority")],
        RPS_PROGRAM_ID
    );
    return pda;
}

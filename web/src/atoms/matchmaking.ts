import { atom } from "jotai";
import { PublicKey } from "@solana/web3.js";
import { PlayerStatus, QueueHead } from "@/lib/types";

// Current Queue PDA
export const queuePdaAtom = atom<PublicKey | null>(null);

// User's Status
export const playerStatusAtom = atom<PlayerStatus | null>(null);

// Is Searching?
export const isSearchingAtom = atom((get) => {
    const status = get(playerStatusAtom);
    // If in queue AND not in match logic (if we trust inMatch flag)
    // The IDL for PlayerStatus has `inMatch`.
    // @ts-ignore - verify if generated types caught up, but runtime it exists
    return !!(status?.queue && !status?.inMatch);
});

// Match Info (from Event)
export const matchInfoAtom = atom<{ 
    opponent: PublicKey, 
    gameId: import("@coral-xyz/anchor").BN
} | null>(null);

// Is In Game? (Matched)
export const activeGameAtom = atom((get) => {
    const status = get(playerStatusAtom);
    const matchInfo = get(matchInfoAtom);
    
    // If we have local match info, we are in game
    if (matchInfo) return matchInfo;

    // Fallback: If status says inMatch but we missed event?
    // We can't recover easily without a persistent Match account.
    // For now, rely on matchInfoAtom (populated by event).
    return null;
});

"use client";

import { useAtom, useAtomValue } from "jotai";
import { walletPublicKeyAtom } from "@/atoms/wallet";
import { useMatchmakingClient } from "@/hooks/useMatchmakingClient";
import { deriveQueuePda, derivePlayerStatusPda } from "@/lib/matchmaking-utils";
import { derivePlayerProfilePda, deriveQueueAuthorityPda } from "@/lib/game-utils";
import { QUEUE_ID, RPS_PROGRAM_ID } from "@/lib/constants";
import { useState, useEffect } from "react";
import { PlayerProfile } from "@/lib/types";
import { PublicKey } from "@solana/web3.js";

export function Lobby({ profile }: { profile: PlayerProfile }) {
    const wallet = useAtomValue(walletPublicKeyAtom);
    const client = useMatchmakingClient();
    
    // UI States
    const [isJoining, setIsJoining] = useState(false);
    const [queueExists, setQueueExists] = useState<boolean | null>(null);
    const [queuePda, setQueuePda] = useState<PublicKey | null>(null);

    // Initial Check
    useEffect(() => {
        if (!client || !wallet) return;
        const authorityPda = deriveQueueAuthorityPda();
        const pda = deriveQueuePda(client.program.programId, authorityPda, QUEUE_ID);
        setQueuePda(pda);

        client.program.account.queueHead.fetch(pda)
            .then(() => setQueueExists(true))
            .catch(() => setQueueExists(false));
    }, [client, wallet]);

    const handleCreateQueue = async () => {
        alert("Please run 'npx ts-node scripts/init_queue.ts' to initialize the Production Queue via the Admin Script.");
        // We disabled client-side init because it requires complex CPI setup now (initializeMsgQueue).
    };

    // Polling for Player Status
    useEffect(() => {
        if (!client || !wallet) return;

        const checkStatus = async () => {
             try {
                const profilePda = derivePlayerProfilePda(wallet);
                // Note: PlayerStatus is derived from the Game Account (Profile), not Wallet directly
                const statusPda = derivePlayerStatusPda(client.program.programId, profilePda);
                const status = await client.program.account.playerStatus.fetchNullable(statusPda);
                
                // If status exists, they are technically tracked by the MM program.
                // If inMatch is false, they are waiting in the queue.
                if (status && !status.inMatch) {
                    setIsJoining(true);
                    console.log("Player is in queue.");
                } else {
                    // Only start polling if we think we might have joined or if we want to be robust
                    // For now, if not in queue, we assume idle.
                    if (isJoining) {
                        // If we thought we were joining but status says no, maybe we got matched?
                        // Or maybe we timed out? For now, let's keep isJoining true until match event or manual cancel (not implemented).
                    }
                }
             } catch (e) {
                 console.error("Failed to fetch player status", e);
             }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, [client, wallet]);

    const handleFindMatch = async () => {
        if (!client || !wallet || !queuePda) return;
        setIsJoining(true);
        try {
            const profilePda = derivePlayerProfilePda(wallet);
            
            // Note: client.joinQueue signature: (queue, playerGameAccount)
            await client.joinQueue(queuePda, profilePda); 
            
            // alert("Joined Queue! (Polling implementation pending)");
             
        } catch (e) {
            console.error("Matchmaking error", e);
            alert("Error joining queue: " + (e as any).message);
            setIsJoining(false);
        }
    };

    const handleProcessMatch = async () => {
        if (!client || !queuePda) return;
        try {
            // Processing Page 0 for demo
            await client.processMatch(queuePda, 0);
            console.log("Queue Processed");
        } catch (e) {
            console.error(e);
            alert("Failed to process queue: " + (e as any).message);
        }
    };

    if (queueExists === false) {
        return (
            <div className="text-center p-8 border border-dashed border-zinc-700 rounded-xl">
                <h3 className="text-lg font-bold mb-4">No Arena Found</h3>
                <p className="text-zinc-500 mb-4">Be the first to initialize the matchmaking queue.</p>
                <button 
                    onClick={handleCreateQueue}
                    disabled={isJoining}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg"
                >
                    {isJoining ? "Creating..." : "Initialize Arena"}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="text-center">
                 <h2 className="text-xl font-bold">Lobby</h2>
                 <p className="text-zinc-500 text-sm">Queue ID: {QUEUE_ID}</p>
            </div>
            
            <button 
                onClick={handleFindMatch}
                disabled={isJoining || queueExists === null}
                className="bg-blue-600 px-8 py-3 rounded-xl font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer transition-all hover:scale-105"
            >
                {isJoining ? "Searching..." : "Find Match"}
            </button>

            <button 
                onClick={handleProcessMatch}
                className="mt-4 text-xs text-zinc-600 hover:text-zinc-400 underline"
            >
                [DEBUG] Crank Queue
            </button>
        </div>
    );
}

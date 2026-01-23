"use client";

import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { walletPublicKeyAtom } from "@/atoms/wallet";
import { useMatchmakingClient } from "@/hooks/useMatchmakingClient";
import { matchInfoAtom } from "@/atoms/matchmaking";
import { MatchFoundEvent } from "@/lib/types";
import { BN } from "@coral-xyz/anchor";

export function useMatchmakingListener() {
    const client = useMatchmakingClient();
    const wallet = useAtomValue(walletPublicKeyAtom);
    const setMatchInfo = useSetAtom(matchInfoAtom);

    useEffect(() => {
        if (!client || !wallet) return;

        console.log("Listening for matchmaking events...");

        // Define Event Listener
        const listenerId = client.program.addEventListener("matchFound", (event, slot) => {
            const e = event as MatchFoundEvent;
            console.log("Match Found Event!", e);

            const isA = e.playerA.equals(wallet);
            const isB = e.playerB.equals(wallet);

            if (isA || isB) {
                const opponent = isA ? e.playerB : e.playerA;
                // Derive a deterministic Game ID from the Match details?
                // For this demo, let's use the current timestamp or something derived.
                // Revert to intro-demo.ts logic: "const gameId = new BN(0);"
                // Wait, if multiple games happen, ID collision?
                // The RPS `create_game` takes a u64 ID.
                // We should use part of the Match Timestamp or something unique.
                const gameId = e.timestamp; // Use timestamp as Game ID for simplicity in demo
                
                console.log(`Matched with ${opponent.toBase58()}. Game ID: ${gameId.toString()}`);
                
                setMatchInfo({
                    opponent,
                    gameId
                });
            }
        });

        return () => {
            client.program.removeEventListener(listenerId);
        };
    }, [client, wallet, setMatchInfo]);
}

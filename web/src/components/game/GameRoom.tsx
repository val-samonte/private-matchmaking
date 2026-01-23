"use client";

import { useAtomValue } from "jotai";
import { walletPublicKeyAtom } from "@/atoms/wallet";
import { useRpsProgram } from "@/hooks/useRpsProgram";
import { useState, useEffect, useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN, utils } from "@coral-xyz/anchor";
import { RPS_PROGRAM_ID } from "@/lib/constants";

function deriveGameAddresses(gameId: BN, p1: PublicKey, p2: PublicKey) {
    const [gamePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("game"), gameId.toArrayLike(Buffer, "le", 8)],
        RPS_PROGRAM_ID
    );
    return { gamePda };
}

export function GameRoom({ gameId, opponent }: { gameId: BN, opponent: PublicKey }) {
    const wallet = useAtomValue(walletPublicKeyAtom);
    const program = useRpsProgram();
    
    // Game State
    const [gameState, setGameState] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    
    // Derived Roles
    const { isPlayer1, p1, p2 } = useMemo(() => {
        if (!wallet) return { isPlayer1: false, p1: PublicKey.default, p2: PublicKey.default };
        // Sort keys to determine P1/P2 deterministically
        const isP1 = wallet.toBuffer().compare(opponent.toBuffer()) < 0;
        return {
            isPlayer1: isP1,
            p1: isP1 ? wallet : opponent,
            p2: isP1 ? opponent : wallet
        };
    }, [wallet, opponent]);

    const { gamePda } = useMemo(() => 
        deriveGameAddresses(gameId, p1, p2), 
    [gameId, p1, p2]);

    // Polling Game State
    useEffect(() => {
        if (!program) return;
        const interval = setInterval(async () => {
            try {
                const acc = await program.account.game.fetch(gamePda);
                setGameState(acc);
            } catch (e) {
                setGameState(null);
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [program, gamePda]);

    // Peer-to-Peer "Ready" Logic
    useEffect(() => {
        if (!program || !gameId || loading) return;
        
        // If we found the game account, we are good.
        if (gameState && gameState.result) return; 

        const connectToSession = async () => {
             // Avoid double trigger
             if (loading) return; 

             try {
                console.log("Connecting to Game Session (Ready)...");
                setLoading(true);
                
                const [choicePda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("player_choice"), new BN(gameId).toArrayLike(Buffer, "le", 8), wallet.toBuffer()],
                     program.programId
                );

                // Both players call the same instruction. 
                // First to land = Player 1. Second = Player 2.
                // Uses init_if_needed so it is idempotent.
                await program.methods
                    // @ts-ignore
                    .joinSession(new BN(gameId)) 
                    .accounts({
                        // @ts-ignore
                        game: gamePda,
                        playerChoice: choicePda,
                        player: wallet,
                        systemProgram: PublicKey.default 
                    })
                    .rpc();
                    
                console.log(`Connected to Session!`);
             } catch (e) {
                 console.error("Connection failed", e);
             } finally {
                 setLoading(false);
             }
        };
        
        // Only run if gameState is not yet loaded/valid
        if (!gameState) {
             connectToSession();
        }

    }, [program, gameId, gameState]); 
    

    if (!gameState || !gameState.result) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                 <h2 className="text-xl font-bold">Connecting...</h2>
                 <p className="text-zinc-500">Establishing Secure Session</p>
                 <div className="text-xs text-zinc-700 mt-4">Game ID: {gameId.toString()}</div>
            </div>
        );
    }

    // Actions (Restored)
    const makeChoice = async (choice: any) => {
        if (!program || !wallet) return;
        setLoading(true);
        try {
             // @ts-ignore - Validated check above
            await program.methods.makeChoice(gameId, choice)
                .accounts({ 
                    player: wallet,
                    // @ts-ignore
                    game: gamePda
                })
                .rpc();
            setLocalChoiceMade(true);
        } catch (e) {
            console.error("Choice failed", e);
        } finally {
            setLoading(false);
        }
    };

    const reveal = async () => {
        if (!program || !wallet) return;
        setLoading(true);
        try {
            // Re-importing utils as they were in the previous block
            const { derivePlayerProfilePda, deriveQueueAuthorityPda } = await import("@/lib/game-utils");
            const { derivePlayerStatusPda, deriveQueuePda } = await import("@/lib/matchmaking-utils");
            const { QUEUE_ID, MATCHMAKING_PROGRAM_ID } = await import("@/lib/constants");

            const p1Profile = derivePlayerProfilePda(p1);
            const p2Profile = derivePlayerProfilePda(p2);
            const authorityPda = deriveQueueAuthorityPda();
            const queuePda = deriveQueuePda(MATCHMAKING_PROGRAM_ID, authorityPda, QUEUE_ID);
            const p1Status = derivePlayerStatusPda(MATCHMAKING_PROGRAM_ID, p1Profile); 
            const p2Status = derivePlayerStatusPda(MATCHMAKING_PROGRAM_ID, p2Profile);

            await program.methods.revealWinner()
                .accounts({
                    // @ts-ignore
                    game: gamePda,
                    player1Profile: p1Profile,
                    player2Profile: p2Profile,
                    queue: queuePda,
                    player1Status: p1Status,
                    player2Status: p2Status,
                    authority: authorityPda, 
                    player1Wallet: p1,
                    player2Wallet: p2,
                    matchmakingProgram: MATCHMAKING_PROGRAM_ID,
                })
                .rpc();
        } catch (e) {
            console.error("Reveal failed", e);
        } finally {
            setLoading(false);
        }
    };
    const result = gameState.result;
    const isDone = !result.none;
    const isWaitingForOpponent = !gameState.player2;
    // For now, simplicity: if P2 is there and result is None, it's Active.
    // Ideally we fetch PlayerChoice accounts to see if we can Reveal.
    // Since we don't have them here easily without refactor, let's allow "Reveal" if we clicked a button or just always show buttons?
    // Actually, "Reveal" is usually manual step in this flow.
    // Let's assume Active = Not Done.
    const isActive = !isDone && !isWaitingForOpponent;
    
    // Simplification: "Reveal" button appears if we are active. 
    // In a real TEE app, we'd check if both have committed. 
    // For this debug fix, let's toggle a local state for "Choice Made" -> "Reveal Ready".
    const [localChoiceMade, setLocalChoiceMade] = useState(false);
    const isReveal = isActive && localChoiceMade; 
    
    // Reset local choice if game resets (not handled here but good practice)
    useEffect(() => {
        if (isDone) setLocalChoiceMade(false);
    }, [isDone]);

    return (
        <div className="p-8 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-2">Battle Arena</h2>
            <div className="mb-8 text-zinc-500 text-sm">VS {opponent.toBase58().slice(0,6)}...</div>
            
            <div className="mb-8 text-zinc-500 text-sm">VS {opponent.toBase58().slice(0,6)}...</div>

            {isWaitingForOpponent && (
                <div className="animate-pulse text-yellow-500 font-bold mb-8">
                    Waiting for Opponent to Join...
                </div>
            )}
            
            {isActive && !isReveal && (
                <div className="grid grid-cols-3 gap-4 mt-8">
                    <button 
                        onClick={() => makeChoice({ rock: {} })}
                        disabled={loading}
                        className="p-8 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-6xl hover:scale-110 transition-transform cursor-pointer"
                    >
                        ✊
                        <div className="text-sm mt-4 font-bold text-zinc-400">Rock</div>
                    </button>
                    <button 
                        onClick={() => makeChoice({ paper: {} })}
                        disabled={loading}
                        className="p-8 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-6xl hover:scale-110 transition-transform cursor-pointer"
                    >
                        ✋
                         <div className="text-sm mt-4 font-bold text-zinc-400">Paper</div>
                    </button>
                    <button 
                        onClick={() => makeChoice({ scissors: {} })}
                        disabled={loading}
                        className="p-8 bg-zinc-800 rounded-xl hover:bg-zinc-700 text-6xl hover:scale-110 transition-transform cursor-pointer"
                    >
                        ✌️
                         <div className="text-sm mt-4 font-bold text-zinc-400">Scissors</div>
                    </button>
                </div>
            )}

            {isReveal && (
                 <div className="mt-8">
                    <h3 className="text-xl mb-4 text-zinc-300">Choices Locked!</h3>
                    <button 
                        onClick={reveal}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-12 rounded-full text-lg shadow-xl hover:scale-105 transition-transform"
                    >
                        {loading ? "Revealing..." : "Reveal Winner"}
                    </button>
                 </div>
            )}
            
            {isDone && (
                <div className="p-8 bg-zinc-900 rounded-xl border border-zinc-700">
                    <h3 className="text-3xl font-bold text-white mb-2">Game Over</h3>
                    <div className="text-zinc-400">Check profile for updated ELO!</div>
                </div>
            )}
            
            <div className="mt-12 opacity-50 text-xs">
                Status: {isDone ? "Game Over" : isWaitingForOpponent ? "Waiting P2" : isReveal ? "Reveal Phase" : "Battle Phase"}
            </div>
        </div>
    );
}

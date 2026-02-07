"use client";

import { useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useAtomValue } from "jotai";
import { PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { getTeeAuthToken, createTeeProvider, waitForDelegation } from "@/lib/utils/tee";
import { deriveGameSessionPda, derivePlayerProfilePda, deriveTicketPda, deriveTenantPda } from "@/lib/utils/pda";
import { 
  RPS_GAME_PROGRAM_ID, 
  TEE_RPC_URL, 
  TEE_WS_URL, 
  ER_VALIDATOR,
  QUEUE_AUTHORITY,
  DUEL_PROGRAM_ID 
} from "@/lib/constants";
import IDL from "@/lib/types/rps_game.json";
import type { RpsGame } from "@/lib/types/rps_game_idl";
import { Choice, GameResult, choiceToAnchor, parseGameResult } from "@/lib/types/rps";

export type GameSessionState = 
  | "idle" 
  | "starting" 
  | "delegating"
  | "ready"
  | "waiting_choice" 
  | "waiting_opponent" 
  | "resolving"
  | "persisting"
  | "complete"
  | "error";

export function useGameSession() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const profilePda = useAtomValue(playerProfilePdaAtom);
  
  const [gameState, setGameState] = useState<GameSessionState>("idle");
  const [gameSessionPda, setGameSessionPda] = useState<PublicKey | null>(null);
  const [opponent, setOpponent] = useState<PublicKey | null>(null);
  const [gameId, setGameId] = useState<BN | null>(null);
  const [playerChoice, setPlayerChoice] = useState<Choice | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback(async (opponentPubkey: PublicKey, newGameId: number, role: "player1" | "player2") => {
    if (!wallet.publicKey || !profilePda) {
      throw new Error("Wallet not connected or profile not found");
    }

    try {
      setGameState("starting");
      setError(null);
      setOpponent(opponentPubkey);
      
      const gameIdBN = new BN(newGameId);
      setGameId(gameIdBN);

      console.log(`Starting game as ${role}...`);
      console.log("Game ID:", newGameId);
      console.log("Opponent:", opponentPubkey.toBase58());

      // 1. Derive game session PDA
      const [sessionPda] = deriveGameSessionPda(
        role === "player1" ? wallet.publicKey : opponentPubkey,
        role === "player1" ? opponentPubkey : wallet.publicKey,
        gameIdBN,
        RPS_GAME_PROGRAM_ID
      );
      setGameSessionPda(sessionPda);
      console.log("Game Session PDA:", sessionPda.toBase58());

      if (role === "player1") {
        // PLAYER 1: Create and Delegate
        const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed", skipPreflight: true });
        const program = new Program(IDL as any, provider) as Program<RpsGame>;
        
        // Derive MatchTicket PDA
        const [tenantPda] = deriveTenantPda(QUEUE_AUTHORITY);
        const [ticketPda] = deriveTicketPda(wallet.publicKey, tenantPda, DUEL_PROGRAM_ID);

        console.log("P1: Calling start_game_with_ticket instruction...");
        await program.methods
          .startGameWithTicket(gameIdBN, opponentPubkey)
          .accounts({
            player: wallet.publicKey,
            matchTicket: ticketPda,
          } as any)
          .rpc();
        
        console.log("P1: Game started on L1");

        // Delegate game session
        setGameState("delegating");
        console.log("P1: Delegating game session...");
        
        await program.methods
          .delegatePda({ 
            gameSession: { 
              p1: wallet.publicKey, 
              p2: opponentPubkey, 
              id: gameIdBN 
            } 
          })
          .accounts({
            pda: sessionPda,
            payer: wallet.publicKey,
            validator: ER_VALIDATOR,
          } as any)
          .rpc();
      } else {
        // PLAYER 2: Wait for delegation
        console.log("P2: Waiting for P1 to create and delegate game...");
        setGameState("delegating"); // Re-use delegating state for waiting
      }

      // Both players wait for delegation to be active
      const { token } = await getTeeAuthToken(TEE_RPC_URL, wallet);
      console.log("Waiting for game session delegation propagation...");
      await waitForDelegation(TEE_RPC_URL, token, sessionPda);
      console.log("Game session delegated and active!");

      setGameState("ready");
    } catch (err: any) {
      console.error("Start game error:", err);
      // If P2 and error is "Account not initialized" maybe wait more? 
      // But waitForDelegation handles retries.
      setError(err.message || "Failed to start game");
      setGameState("error");
      throw err;
    }
  }, [wallet, connection, profilePda]);

  const makeChoice = useCallback(async (choice: Choice) => {
    if (!wallet.publicKey || !gameSessionPda || !profilePda || !opponent) {
      throw new Error("Game not started");
    }

    try {
      setGameState("waiting_opponent");
      setPlayerChoice(choice);
      setError(null);

      console.log("Making choice:", choice);

      // Get TEE provider
      const { token } = await getTeeAuthToken(TEE_RPC_URL, wallet);
      const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, wallet);
      const teeProgram = new Program(IDL as any, teeProvider) as Program<RpsGame>;

      // Derive opponent profile PDA
      const [opponentProfilePda] = derivePlayerProfilePda(opponent, RPS_GAME_PROGRAM_ID);

      // Make choice on TEE
      console.log("Submitting choice to TEE...");
      await teeProgram.methods
        .makeChoice(choiceToAnchor(choice) as any)
        .accountsPartial({
          gameSession: gameSessionPda,
          player1Profile: profilePda,
          player2Profile: opponentProfilePda,
          player: wallet.publicKey,
        })
        .rpc();

      console.log("Choice submitted successfully");

      // Poll for game completion
      setGameState("resolving");
      console.log("Waiting for opponent's choice...");
      await pollForGameResult(teeProgram, gameSessionPda, setResult);
      
      setGameState("complete");

    } catch (err: any) {
      console.error("Make choice error:", err);
      setError(err.message || "Failed to make choice");
      setGameState("error");
      throw err;
    }
  }, [wallet, gameSessionPda, profilePda, opponent]);

  const persistResults = useCallback(async () => {
    if (!wallet.publicKey || !gameSessionPda || !profilePda || !opponent) {
      throw new Error("Game not complete");
    }

    try {
      setGameState("persisting");
      setError(null);

      console.log("Persisting results to L1...");

      const { token } = await getTeeAuthToken(TEE_RPC_URL, wallet);
      const teeProvider = createTeeProvider(TEE_RPC_URL, TEE_WS_URL, token, wallet);
      const teeProgram = new Program(IDL as any, teeProvider) as Program<RpsGame>;

      const [opponentProfilePda] = derivePlayerProfilePda(opponent, RPS_GAME_PROGRAM_ID);

      await teeProgram.methods
        .persistResults()
        .accountsPartial({
          gameSession: gameSessionPda,
          player1Profile: profilePda,
          player2Profile: opponentProfilePda,
          payer: wallet.publicKey,
        })
        .rpc();

      console.log("Results persisted successfully");
      setGameState("complete");
    } catch (err: any) {
      console.error("Persist results error:", err);
      setError(err.message || "Failed to persist results");
      setGameState("error");
      throw err;
    }
  }, [wallet, gameSessionPda, profilePda, opponent]);

  const reset = useCallback(() => {
    setGameState("idle");
    setGameSessionPda(null);
    setOpponent(null);
    setGameId(null);
    setPlayerChoice(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    gameState,
    gameSessionPda,
    opponent,
    gameId,
    playerChoice,
    result,
    error,
    startGame,
    makeChoice,
    persistResults,
    reset,
  };
}

// Helper to poll for game result
async function pollForGameResult(
  program: Program<RpsGame>,
  sessionPda: PublicKey,
  setResult: (result: GameResult) => void,
  maxAttempts = 30,
  pollInterval = 2000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, pollInterval));
    
    try {
      const session = await program.account.gameSession.fetch(sessionPda);
      
      // Check if both players have made choices
      if (session.player1Choice !== null && session.player2Choice !== null) {
        console.log("Both players have chosen - game resolved");
        const parsedResult = parseGameResult(session.result);
        setResult(parsedResult);
        return;
      }
      
      console.log(`Polling attempt ${i + 1}/${maxAttempts} - waiting for opponent...`);
    } catch (err) {
      console.error("Poll error:", err);
    }
  }
  
  throw new Error("Game resolution timed out");
}

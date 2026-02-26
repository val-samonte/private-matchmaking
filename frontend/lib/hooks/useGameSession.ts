"use client";

import { useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import type { Address } from "@solana/kit";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { rpcAtom } from "@/lib/atoms/program";
import { useWalletContext } from "@/lib/contexts/WalletContext";
import { getTeeAuthToken, waitForDelegation } from "@/lib/utils/tee";
import { walletToSigner } from "@/lib/utils/wallet-bridge";
import { sendInstruction } from "@/lib/utils/transaction";
import { derivePlayerProfilePda, deriveTicketPda, deriveTenantPda, deriveGameSessionPda } from "@/lib/utils/pda";
import {
  RPS_GAME_PROGRAM_ID,
  TEE_RPC_URL,
  TEE_WS_URL,
  ER_VALIDATOR,
  QUEUE_AUTHORITY,
  DUEL_PROGRAM_ID,
} from "@/lib/constants";
import { Choice, type GameResult } from "@/lib/types/rps";
import {
  getStartGameWithTicketInstructionAsync,
  getDelegatePdaInstructionAsync,
  getMakeChoiceInstruction,
  getPersistResultsInstruction,
  fetchMaybeGameSession,
} from "@sdk/generated/rps-game";
import { Choice as CodamaChoice } from "@sdk/generated/rps-game/types";
import { createSolanaRpc } from "@solana/kit";

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

// Convert our UI Choice enum to Codama numeric enum
function toCodamaChoice(choice: Choice): CodamaChoice {
  switch (choice) {
    case Choice.Rock: return CodamaChoice.Rock;
    case Choice.Paper: return CodamaChoice.Paper;
    case Choice.Scissors: return CodamaChoice.Scissors;
  }
}

export function useGameSession() {
  const { publicKey, kitWallet } = useWalletContext();
  const rpc = useAtomValue(rpcAtom);
  const profilePda = useAtomValue(playerProfilePdaAtom);

  const [gameState, setGameState] = useState<GameSessionState>("idle");
  const [gameSessionPda, setGameSessionPda] = useState<Address | null>(null);
  const [opponent, setOpponent] = useState<Address | null>(null);
  const [gameId, setGameId] = useState<bigint | null>(null);
  const [playerChoice, setPlayerChoice] = useState<Choice | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback(async (
    opponentAddr: Address,
    newGameId: number,
    role: "player1" | "player2"
  ) => {
    if (!publicKey || !profilePda || !kitWallet) {
      throw new Error("Wallet not connected or profile not found");
    }

    try {
      setGameState("starting");
      setError(null);
      setOpponent(opponentAddr);

      const gameIdBig = BigInt(newGameId);
      setGameId(gameIdBig);

      console.log(`Starting game as ${role}...`);
      console.log("Game ID:", newGameId);
      console.log("Opponent:", opponentAddr);

      const signer = walletToSigner(kitWallet);

      // Derive game session PDA
      const p1 = role === "player1" ? publicKey : opponentAddr;
      const p2 = role === "player1" ? opponentAddr : publicKey;
      const [sessionPda] = await deriveGameSessionPda(p1, p2, gameIdBig, RPS_GAME_PROGRAM_ID);
      setGameSessionPda(sessionPda);
      console.log("Game Session PDA:", sessionPda);

      if (role === "player1") {
        // Derive MatchTicket PDA
        const [tenantPda] = await deriveTenantPda(QUEUE_AUTHORITY);
        const [ticketPda] = await deriveTicketPda(publicKey, tenantPda, DUEL_PROGRAM_ID);

        console.log("P1: Calling start_game_with_ticket...");
        const startIx = await getStartGameWithTicketInstructionAsync({
          player: signer,
          matchTicket: ticketPda,
          gameId: gameIdBig,
          opponent: opponentAddr,
        });
        await sendInstruction(rpc, startIx, kitWallet);
        console.log("P1: Game started on L1");

        // Delegate game session to TEE
        setGameState("delegating");
        console.log("P1: Delegating game session...");
        const delegateIx = await getDelegatePdaInstructionAsync({
          pda: sessionPda,
          payer: signer,
          validator: ER_VALIDATOR,
          accountType: { __kind: "GameSession", fields: [{ p1: publicKey, p2: opponentAddr, id: gameIdBig }] } as any,
        });
        await sendInstruction(rpc, delegateIx, kitWallet);
      } else {
        // PLAYER 2: Wait for P1 to create and delegate game
        console.log("P2: Waiting for P1 to create and delegate game...");
        setGameState("delegating");
      }

      // Both players wait for TEE delegation to activate
      const { token } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);
      console.log("Waiting for game session delegation...");
      await waitForDelegation(TEE_RPC_URL, token, sessionPda);
      console.log("Game session delegated and active!");

      setGameState("ready");
    } catch (err: any) {
      console.error("Start game error:", err);
      setError(err.message || "Failed to start game");
      setGameState("error");
      throw err;
    }
  }, [publicKey, rpc, profilePda, kitWallet]);

  const makeChoice = useCallback(async (choice: Choice) => {
    if (!publicKey || !gameSessionPda || !profilePda || !opponent || !kitWallet) {
      throw new Error("Game not started");
    }

    try {
      setGameState("waiting_opponent");
      setPlayerChoice(choice);
      setError(null);

      console.log("Making choice:", choice);

      // Get TEE auth token and provider
      const { token } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);
      const teeRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${token}`);

      const signer = walletToSigner(kitWallet);

      // Derive opponent profile PDA
      const [opponentProfilePda] = await derivePlayerProfilePda(opponent, RPS_GAME_PROGRAM_ID);

      // Determine player1/player2 profile order
      const isPlayer1 = (await deriveGameSessionPda(publicKey, opponent, gameId!, RPS_GAME_PROGRAM_ID))[0] === gameSessionPda;
      const player1ProfilePda = isPlayer1 ? profilePda : opponentProfilePda;
      const player2ProfilePda = isPlayer1 ? opponentProfilePda : profilePda;

      const choiceIx = getMakeChoiceInstruction({
        gameSession: gameSessionPda,
        player1Profile: player1ProfilePda,
        player2Profile: player2ProfilePda,
        player: signer,
        choice: toCodamaChoice(choice),
      });

      console.log("Submitting choice to TEE...");
      await sendInstruction(teeRpc, choiceIx, kitWallet);
      console.log("Choice submitted");

      // Poll for game completion
      setGameState("resolving");
      console.log("Waiting for opponent's choice...");
      await pollForGameResult(teeRpc, gameSessionPda, setResult);

      setGameState("complete");
    } catch (err: any) {
      console.error("Make choice error:", err);
      setError(err.message || "Failed to make choice");
      setGameState("error");
      throw err;
    }
  }, [publicKey, gameSessionPda, profilePda, opponent, gameId, kitWallet]);

  const persistResults = useCallback(async () => {
    if (!publicKey || !gameSessionPda || !profilePda || !opponent || !kitWallet) {
      throw new Error("Game not complete");
    }

    try {
      setGameState("persisting");
      setError(null);

      console.log("Persisting results to L1...");

      const { token } = await getTeeAuthToken(TEE_RPC_URL, kitWallet);
      const teeRpc = createSolanaRpc(`${TEE_RPC_URL}?token=${token}`);
      const signer = walletToSigner(kitWallet);

      const [opponentProfilePda] = await derivePlayerProfilePda(opponent, RPS_GAME_PROGRAM_ID);
      const isPlayer1 = (await deriveGameSessionPda(publicKey, opponent, gameId!, RPS_GAME_PROGRAM_ID))[0] === gameSessionPda;

      const persistIx = getPersistResultsInstruction({
        gameSession: gameSessionPda,
        player1Profile: isPlayer1 ? profilePda : opponentProfilePda,
        player2Profile: isPlayer1 ? opponentProfilePda : profilePda,
        payer: signer,
      });

      await sendInstruction(teeRpc, persistIx, kitWallet);
      console.log("Results persisted");
      setGameState("complete");
    } catch (err: any) {
      console.error("Persist results error:", err);
      setError(err.message || "Failed to persist results");
      setGameState("error");
      throw err;
    }
  }, [publicKey, gameSessionPda, profilePda, opponent, gameId, kitWallet]);

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

async function pollForGameResult(
  rpc: ReturnType<typeof createSolanaRpc>,
  sessionPda: Address,
  setResult: (result: GameResult) => void,
  maxAttempts = 30,
  pollInterval = 2000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const maybeAccount = await fetchMaybeGameSession(rpc, sessionPda);
      if (!maybeAccount.exists) continue;

      const { player1Choice, player2Choice, result } = maybeAccount.data;
      if (player1Choice.__option === "Some" && player2Choice.__option === "Some") {
        console.log("Both players have chosen - game resolved");
        // Convert Codama GameResult to our GameResult
        if (result.__kind === "Winner") {
          setResult({ winner: result.fields[0] });
        } else if (result.__kind === "Tie") {
          setResult({ tie: {} });
        } else {
          setResult({ none: {} });
        }
        return;
      }

      console.log(`Polling attempt ${i + 1}/${maxAttempts} - waiting for opponent...`);
    } catch (err) {
      console.error("Poll error:", err);
    }
  }

  throw new Error("Game resolution timed out");
}

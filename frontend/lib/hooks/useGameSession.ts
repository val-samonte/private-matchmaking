"use client";

import { useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import type { Address } from "@solana/kit";
import { playerProfilePdaAtom } from "@/lib/atoms/player";
import { rpcAtom } from "@/lib/atoms/program";
import { walletAtom } from "@/lib/atoms/wallet";
import {
  sessionSignerAtom,
  sessionKitWalletAtom,
  isSessionActiveAtom,
  rpsSessionTokenPdaAtom,
} from "@/lib/atoms/session";
import { createAuthenticatedTeeRpc, waitForDelegation } from "@/lib/utils/tee";
import { walletToSigner } from "@/lib/utils/wallet-bridge";
import { sendInstruction } from "@/lib/utils/transaction";
import { relayTx } from "@/lib/utils/relay";
import { derivePlayerProfilePda, deriveTicketPda, deriveTenantPda, deriveGameSessionPda } from "@/lib/utils/pda";
import { deriveSessionTokenPda } from "@/lib/utils/session";
import {
  RPS_GAME_PROGRAM_ID,
  TEE_RPC_URL,
  QUEUE_AUTHORITY,
  DUEL_PROGRAM_ID,
  SERVER_ADDRESS,
  GUM_SESSION_PROGRAM,
} from "@/lib/constants";
import { Choice, type GameResult } from "@/lib/types/rps";
import {
  getStartGameWithTicketInstructionAsync,
  getMakeChoiceInstruction,
  fetchMaybeGameSession,
} from "@sdk/generated/rps-game";
import { Choice as CodamaChoice } from "@sdk/generated/rps-game/types";
import { createSolanaRpc, type TransactionPartialSigner } from "@solana/kit";

/** No-op dummy signer for relay transactions where server signs server-side. */
function serverDummySigner(address: Address): TransactionPartialSigner {
  return {
    address,
    signTransactions: async (txs) => txs.map(() => ({} as Record<Address, import("@solana/kit").SignatureBytes>)),
  };
}

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

function toCodamaChoice(choice: Choice): CodamaChoice {
  switch (choice) {
    case Choice.Rock: return CodamaChoice.Rock;
    case Choice.Paper: return CodamaChoice.Paper;
    case Choice.Scissors: return CodamaChoice.Scissors;
  }
}

export function useGameSession() {
  const publicKey = useAtomValue(walletAtom);
  const sessionSigner = useAtomValue(sessionSignerAtom);
  const sessionKitWallet = useAtomValue(sessionKitWalletAtom);
  const isSessionActive = useAtomValue(isSessionActiveAtom);
  const rpsSessionTokenPda = useAtomValue(rpsSessionTokenPdaAtom);
  const rpc = useAtomValue(rpcAtom);
  const profilePda = useAtomValue(playerProfilePdaAtom);

  const [gameState, setGameState] = useState<GameSessionState>("idle");
  const [gameSessionPda, setGameSessionPda] = useState<Address | null>(null);
  const [opponent, setOpponent] = useState<Address | null>(null);
  const [gameId, setGameId] = useState<bigint | null>(null);
  const [playerChoice, setPlayerChoice] = useState<Choice | null>(null);
  const [opponentChoice, setOpponentChoice] = useState<Choice | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback(async (
    opponentAddr: Address,
    newGameId: number,
    role: "player1" | "player2"
  ) => {
    if (!publicKey || !profilePda) {
      throw new Error("Wallet not connected or profile not found");
    }
    if (!isSessionActive || !sessionSigner || !sessionKitWallet) {
      throw new Error("Session key required. Please create a session first.");
    }

    try {
      setGameState("starting");
      setError(null);
      setOpponent(opponentAddr);

      const gameIdBig = BigInt(newGameId);
      setGameId(gameIdBig);

      console.log(`Starting game as ${role}...`);

      const p1 = role === "player1" ? publicKey : opponentAddr;
      const p2 = role === "player1" ? opponentAddr : publicKey;
      const [sessionPda] = await deriveGameSessionPda(p1, p2, gameIdBig, RPS_GAME_PROGRAM_ID);
      setGameSessionPda(sessionPda);
      console.log("Game Session PDA:", sessionPda);

      if (role === "player1") {
        const [tenantPda] = await deriveTenantPda(QUEUE_AUTHORITY);
        const [ticketPda] = await deriveTicketPda(publicKey, tenantPda, DUEL_PROGRAM_ID);

        console.log("P1: Calling start_game_with_ticket via relay…");
        const serverSigner = serverDummySigner(SERVER_ADDRESS);
        const startIx = await getStartGameWithTicketInstructionAsync({
          player: publicKey,         // real player (UncheckedAccount → Address)
          signer: sessionSigner,     // session key (TransactionSigner, slot 1)
          payer: serverSigner,       // server dummy (address only, relay signs slot 0)
          matchTicket: ticketPda,
          gameId: gameIdBig,
          opponent: opponentAddr,
          sessionToken: rpsSessionTokenPda ?? undefined,
          sessionProgram: GUM_SESSION_PROGRAM,  // program that issued the session token
        }, { programAddress: RPS_GAME_PROGRAM_ID });

        await relayTx(
          rpc,
          [startIx as unknown as import("@solana/kit").Instruction],
          sessionSigner,
          SERVER_ADDRESS,
        );
        console.log("P1: Game started on L1");

        // Server delegates game session
        setGameState("delegating");
        console.log("P1: Delegating game session via server API…");
        const delegateGameRes = await fetch("/api/delegate-game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player1: p1,
            player2: p2,
            gameId: gameIdBig.toString(),
          }),
        });
        if (!delegateGameRes.ok) {
          const err = await delegateGameRes.json() as { error?: string };
          throw new Error(`Game delegation failed: ${err.error || delegateGameRes.statusText}`);
        }
        console.log("P1: Game session delegated");
      } else {
        console.log("P2: Waiting for P1 to create and delegate game…");
        setGameState("delegating");
      }

      // Both players wait for TEE delegation to activate (session key polls)
      console.log("Waiting for game session delegation…");
      await waitForDelegation(TEE_RPC_URL, sessionKitWallet, sessionPda);
      console.log("Game session active on TEE!");

      setGameState("ready");
    } catch (err: unknown) {
      console.error("Start game error:", err);
      const msg = (err as Error).message?.startsWith("Delegation timeout")
        ? "Game setup timed out — opponent may not have confirmed. Please go back and try again."
        : (err as Error).message || "Failed to start game";
      setError(msg);
      setGameState("error");
      throw err;
    }
  }, [publicKey, rpc, profilePda, sessionSigner, sessionKitWallet, isSessionActive, rpsSessionTokenPda]);

  const makeChoice = useCallback(async (choice: Choice) => {
    if (!publicKey || !gameSessionPda || !profilePda || !opponent || !sessionKitWallet) {
      throw new Error("Game not started");
    }

    try {
      setGameState("waiting_opponent");
      setPlayerChoice(choice);
      setError(null);

      console.log("Making choice:", choice);

      // TEE auth uses session key
      const teeRpc = await createAuthenticatedTeeRpc(TEE_RPC_URL, sessionKitWallet);

      // Use session key for signing when available
      const moveWallet = (isSessionActive && sessionKitWallet) ? sessionKitWallet : null;
      if (!moveWallet) throw new Error("Session key required for make_choice");
      const signer = walletToSigner(moveWallet);

      // Include session token so the program can verify
      const sessionTokenPda = (sessionKitWallet && publicKey)
        ? await deriveSessionTokenPda(RPS_GAME_PROGRAM_ID, sessionKitWallet.address, publicKey as Address)
        : undefined;

      const { player1ProfilePda, player2ProfilePda, isPlayer1 } = await resolveProfilePdas(
        publicKey, opponent, gameId!, gameSessionPda, profilePda,
      );

      const choiceIx = getMakeChoiceInstruction({
        gameSession: gameSessionPda,
        player1Profile: player1ProfilePda,
        player2Profile: player2ProfilePda,
        signer,
        sessionToken: sessionTokenPda,
        choice: toCodamaChoice(choice),
      });

      console.log("Submitting choice via session key (no popup)…");
      await sendInstruction(teeRpc, choiceIx, moveWallet);
      console.log("Choice submitted");

      setGameState("resolving");
      console.log("Waiting for opponent's choice…");
      const { result: gameResult, p1Choice, p2Choice } = await pollForGameResult(teeRpc, gameSessionPda);
      setResult(gameResult);
      setOpponentChoice(isPlayer1 ? p2Choice : p1Choice);

      setGameState("complete");
    } catch (err: unknown) {
      console.error("Make choice error:", err);
      setError((err as Error).message || "Failed to make choice");
      setGameState("error");
      throw err;
    }
  }, [publicKey, gameSessionPda, profilePda, opponent, gameId, sessionKitWallet, isSessionActive]);

  const persistResults = useCallback(async () => {
    if (!publicKey || !gameSessionPda || !opponent || !gameId) {
      throw new Error("Game not complete");
    }

    try {
      setGameState("persisting");
      setError(null);

      console.log("Persisting results via server API…");

      // Determine player1/player2 ordering (same as startGame)
      const [derivedPda] = await deriveGameSessionPda(publicKey, opponent, gameId, RPS_GAME_PROGRAM_ID);
      const p1 = derivedPda === gameSessionPda ? publicKey : opponent;
      const p2 = derivedPda === gameSessionPda ? opponent : publicKey;

      const res = await fetch("/api/persist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player1: p1,
          player2: p2,
          gameId: gameId.toString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(`Persist failed: ${err.error || res.statusText}`);
      }

      console.log("Results persisted");
      setGameState("complete");
    } catch (err: unknown) {
      console.error("Persist results error:", err);
      setError((err as Error).message || "Failed to persist results");
      setGameState("error");
      throw err;
    }
  }, [publicKey, gameSessionPda, opponent, gameId]);

  const reset = useCallback(() => {
    setGameState("idle");
    setGameSessionPda(null);
    setOpponent(null);
    setGameId(null);
    setPlayerChoice(null);
    setOpponentChoice(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    gameState,
    gameSessionPda,
    opponent,
    gameId,
    playerChoice,
    opponentChoice,
    result,
    error,
    startGame,
    makeChoice,
    persistResults,
    reset,
  };
}

async function resolveProfilePdas(
  publicKey: Address,
  opponent: Address,
  gameId: bigint,
  gameSessionPda: Address,
  profilePda: Address,
): Promise<{ player1ProfilePda: Address; player2ProfilePda: Address; isPlayer1: boolean }> {
  const [derivedPda] = await deriveGameSessionPda(publicKey, opponent, gameId, RPS_GAME_PROGRAM_ID);
  const isPlayer1 = derivedPda === gameSessionPda;
  const [opponentProfilePda] = await derivePlayerProfilePda(opponent, RPS_GAME_PROGRAM_ID);
  return {
    player1ProfilePda: isPlayer1 ? profilePda : opponentProfilePda,
    player2ProfilePda: isPlayer1 ? opponentProfilePda : profilePda,
    isPlayer1,
  };
}

function codamaChoiceToChoice(c: { __kind: string }): Choice {
  switch (c.__kind) {
    case "Rock": return Choice.Rock;
    case "Paper": return Choice.Paper;
    case "Scissors": return Choice.Scissors;
    default: throw new Error(`Unknown choice: ${c.__kind}`);
  }
}

async function pollForGameResult(
  rpc: ReturnType<typeof createSolanaRpc>,
  sessionPda: Address,
  maxAttempts = 30,
  pollInterval = 2000,
): Promise<{ result: GameResult; p1Choice: Choice; p2Choice: Choice }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));

    try {
      const maybeAccount = await fetchMaybeGameSession(rpc, sessionPda);
      if (!maybeAccount.exists) continue;

      const { player1Choice, player2Choice, result } = maybeAccount.data;
      if (player1Choice.__option === "Some" && player2Choice.__option === "Some") {
        console.log("Both players have chosen - game resolved");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p1 = codamaChoiceToChoice((player1Choice as any).value);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p2 = codamaChoiceToChoice((player2Choice as any).value);
        let gameResult: GameResult;
        if (result.__kind === "Winner") {
          gameResult = { winner: result.fields[0] };
        } else if (result.__kind === "Tie") {
          gameResult = { tie: {} };
        } else {
          gameResult = { none: {} };
        }
        return { result: gameResult, p1Choice: p1, p2Choice: p2 };
      }

      console.log(`Polling ${i + 1}/${maxAttempts} - waiting for opponent…`);
    } catch (err) {
      console.error("Poll error:", err);
    }
  }

  throw new Error("Game resolution timed out");
}

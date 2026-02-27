"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import { useAtomValue } from "jotai";
import { rpcAtom } from "@/lib/atoms/program";
import { useWalletContext } from "./WalletContext";
import { RPS_GAME_PROGRAM_ID } from "@/lib/constants";
import {
  sendCreateSessionTx,
  sessionKeyToKitWallet,
} from "@/lib/utils/session";
import type { KitWallet } from "@/lib/utils/wallet-bridge";

/** How long a session token is valid (2 hours). */
const SESSION_DURATION_SECONDS = 2 * 60 * 60;

interface SessionContextValue {
  /** The ephemeral session keypair — null until createSession() is called. */
  sessionSigner: KeyPairSigner | null;
  /**
   * A KitWallet-compatible wrapper around the session key.
   * Pass this to sendInstruction() for game moves — no wallet popup required.
   */
  sessionKitWallet: KitWallet | null;
  /** True if a session key is active in memory. */
  isSessionActive: boolean;
  /**
   * Create a new session: generates an ephemeral keypair, submits the
   * create_session instruction (1 wallet popup), and stores the keypair.
   */
  createSession: () => Promise<void>;
  /** Discard the current session key (e.g., on wallet disconnect). */
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const rpc = useAtomValue(rpcAtom);
  const { kitWallet } = useWalletContext();

  const [sessionSigner, setSessionSigner] = useState<KeyPairSigner | null>(null);

  const sessionKitWallet = sessionSigner ? sessionKeyToKitWallet(sessionSigner) : null;

  const createSession = useCallback(async () => {
    if (!kitWallet) throw new Error("Wallet not connected");

    const keypair = await generateKeyPairSigner();
    await sendCreateSessionTx(
      rpc,
      keypair,
      kitWallet,
      RPS_GAME_PROGRAM_ID,
      SESSION_DURATION_SECONDS,
    );
    setSessionSigner(keypair);
    console.log("Session key created:", keypair.address);
  }, [rpc, kitWallet]);

  const clearSession = useCallback(() => {
    setSessionSigner(null);
    console.log("Session key cleared");
  }, []);

  return (
    <SessionContext.Provider
      value={{
        sessionSigner,
        sessionKitWallet,
        isSessionActive: !!sessionSigner,
        createSession,
        clearSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

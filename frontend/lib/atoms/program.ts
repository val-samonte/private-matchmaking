import { atom } from "jotai";
import { Connection } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { rpcEndpointAtom, teeRpcEndpointAtom, teeWsEndpointAtom } from "./cluster";
import { RPS_GAME_PROGRAM_ID, DUEL_PROGRAM_ID } from "../constants";

// Note: We'll need to import the IDLs from the target/types directory
// For now, we'll use placeholders and update these when we copy the IDLs

/**
 * L1 Connection atom
 */
export const connectionAtom = atom((get) => {
  const endpoint = get(rpcEndpointAtom);
  return new Connection(endpoint, "confirmed");
});

/**
 * TEE Connection atom
 */
export const teeConnectionAtom = atom((get) => {
  const rpcEndpoint = get(teeRpcEndpointAtom);
  const wsEndpoint = get(teeWsEndpointAtom);
  return new Connection(rpcEndpoint, {
    wsEndpoint,
    commitment: "confirmed",
  });
});

/**
 * Anchor Provider atom (L1)
 * Note: This will be set up properly in the provider component
 */
export const anchorProviderAtom = atom<AnchorProvider | null>(null);

/**
 * TEE Anchor Provider atom
 * Note: This will be set up properly in the provider component
 */
export const teeAnchorProviderAtom = atom<AnchorProvider | null>(null);

/**
 * RPS Game Program atom (L1)
 */
export const rpsGameProgramAtom = atom<Program | null>(null);

/**
 * Duel Program atom (L1)
 */
export const duelProgramAtom = atom<Program | null>(null);

/**
 * RPS Game Program atom (TEE)
 */
export const teeRpsGameProgramAtom = atom<Program | null>(null);

/**
 * Duel Program atom (TEE)
 */
export const teeDuelProgramAtom = atom<Program | null>(null);

import { atom } from "jotai";
import { SOLANA_NETWORK, RPC_ENDPOINTS } from "../constants";

/**
 * Current cluster atom
 */
export const clusterAtom = atom<"devnet" | "mainnet">(
  SOLANA_NETWORK as "devnet" | "mainnet"
);

/**
 * RPC endpoint atom (derived from cluster)
 */
export const rpcEndpointAtom = atom((get) => {
  const cluster = get(clusterAtom);
  return RPC_ENDPOINTS[cluster];
});

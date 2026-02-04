import { atom } from "jotai";
import { SOLANA_NETWORK, RPC_ENDPOINTS, TEE_RPC_URL, TEE_WS_URL } from "../constants";

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

/**
 * TEE auth token atom
 */
export const teeAuthTokenAtom = atom<string | null>(null);

/**
 * TEE RPC endpoint atom (with auth token)
 */
export const teeRpcEndpointAtom = atom((get) => {
  const token = get(teeAuthTokenAtom);
  return token ? `${TEE_RPC_URL}?token=${token}` : TEE_RPC_URL;
});

/**
 * TEE WebSocket endpoint atom (with auth token)
 */
export const teeWsEndpointAtom = atom((get) => {
  const token = get(teeAuthTokenAtom);
  return token ? `${TEE_WS_URL}?token=${token}` : TEE_WS_URL;
});

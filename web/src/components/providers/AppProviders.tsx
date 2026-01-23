"use client";

import { Provider as JotaiProvider } from "jotai";
import { WalletContextProvider } from "./WalletProvider";
import { WalletAtomSync } from "./WalletAtomSync";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <JotaiProvider>
      <WalletContextProvider>
        <WalletAtomSync />
        {children}
      </WalletContextProvider>
    </JotaiProvider>
  );
}

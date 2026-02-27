"use client";

import { FC, ReactNode } from "react";
import { WalletContextProvider } from "@/lib/contexts/WalletContext";
import { SessionProvider } from "@/lib/contexts/SessionContext";

export const AppWalletProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  return (
    <WalletContextProvider>
      <SessionProvider>
        {children}
      </SessionProvider>
    </WalletContextProvider>
  );
};

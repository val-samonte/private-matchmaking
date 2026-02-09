"use client";

import { FC, ReactNode } from "react";
import { WalletContextProvider } from "@/lib/contexts/WalletContext";

export const AppWalletProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  return (
    <WalletContextProvider>
      {children}
    </WalletContextProvider>
  );
};

"use client";

import dynamic from "next/dynamic";

// Dynamically import WalletMultiButton with no SSR to avoid hydration mismatch
export const WalletButton = dynamic(
  async () => {
    const { WalletMultiButton } = await import("@solana/wallet-adapter-react-ui");
    return WalletMultiButton;
  },
  {
    ssr: false,
  }
);

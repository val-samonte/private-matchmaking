import type { Metadata } from "next";
import "./globals.css";
import { AppWalletProvider } from "@/components/providers/WalletProvider";
import { JotaiProvider } from "@/components/providers/JotaiProvider";

export const metadata: Metadata = {
  title: "RPS Game - Rock Paper Scissors on Solana",
  description: "Play Rock Paper Scissors with private matchmaking on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppWalletProvider>
          <JotaiProvider>{children}</JotaiProvider>
        </AppWalletProvider>
      </body>
    </html>
  );
}

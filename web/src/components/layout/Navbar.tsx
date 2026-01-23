"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

export function Navbar() {
  return (
    <nav className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-xl font-bold tracking-tighter">
          RPS Arena
        </Link>
      </div>
      <div>
        <WalletMultiButton />
      </div>
    </nav>
  );
}

"use client";

import { useState } from "react";
import { usePlayerProfile } from "@/lib/hooks/usePlayerProfile";

export function CreateProfileButton() {
  const { initializeProfile, loading } = usePlayerProfile();
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    try {
      setError(null);
      await initializeProfile();
    } catch (err: any) {
      setError(err.message || "Failed to create profile");
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full bg-gradient-primary text-white font-semibold py-4 px-8 rounded-xl hover:opacity-90 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin">⏳</span>
            Creating Account...
          </span>
        ) : (
          "Create On-Chain Account"
        )}
      </button>

      <div className="text-center text-sm text-foreground-muted">
        <p>Account creation costs ~0.002 SOL (rent)</p>
        <p className="text-xs mt-1">You'll start with 1000 ELO rating</p>
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3 text-sm text-error">
          {error}
        </div>
      )}
    </div>
  );
}

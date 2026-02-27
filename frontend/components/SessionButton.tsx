"use client";

import { useState } from "react";
import { useSession } from "@/lib/contexts/SessionContext";

export function SessionButton() {
  const { isSessionActive, createSession, clearSession } = useSession();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      await createSession();
    } catch (err: any) {
      setError(err.message || "Failed to create session");
    } finally {
      setIsCreating(false);
    }
  };

  if (isSessionActive) {
    return (
      <div className="flex items-center justify-between glass rounded-xl p-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-sm font-medium text-success">Gasless Moves Active</span>
          <span className="text-xs text-foreground-muted">(no wallet popups during gameplay)</span>
        </div>
        <button
          onClick={clearSession}
          className="text-xs text-foreground-muted hover:text-error transition-colors"
        >
          Disable
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleCreate}
        disabled={isCreating}
        className="w-full glass rounded-xl p-4 hover:border-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
      >
        <div className="flex items-center gap-2">
          {isCreating ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary flex-shrink-0" />
          ) : (
            <span className="flex-shrink-0">⚡</span>
          )}
          <span className="font-medium">
            {isCreating ? "Creating Session..." : "Enable Gasless Moves"}
          </span>
        </div>
        <p className="text-xs text-foreground-muted mt-1 ml-6">
          {isCreating
            ? "Approve in wallet — one-time popup"
            : "One-time setup — no wallet popups during gameplay"}
        </p>
      </button>
      {error && (
        <p className="text-error text-xs text-center">{error}</p>
      )}
    </div>
  );
}

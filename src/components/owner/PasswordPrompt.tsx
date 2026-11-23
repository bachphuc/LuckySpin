"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiClientError } from "@/lib/api-client";

interface PasswordPromptProps {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  /** Runs the management request with the password. Throw to show an error. */
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Asks for the owner password for ONE management action. The password lives
 * only in this component's state, is never prefilled, and is cleared after
 * every attempt (success or failure).
 */
export function PasswordPrompt({ title, description, confirmLabel, danger, onConfirm, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => inputRef.current?.focus(), []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const attempt = password;
    setPassword("");
    try {
      await onConfirm(attempt);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "INVALID_OWNER_PASSWORD") {
        setError("Incorrect owner password.");
      } else {
        setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
      }
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => e.key === "Escape" && !busy && onCancel()}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        autoComplete="off"
      >
        <h2 id={titleId} className="text-lg font-bold text-gray-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
        <label htmlFor="owner-pw" className="mt-4 block text-sm font-semibold text-gray-700">
          Owner password
        </label>
        <input
          ref={inputRef}
          id="owner-pw"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!password || busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300 ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

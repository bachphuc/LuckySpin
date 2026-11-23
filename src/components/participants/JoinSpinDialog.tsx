"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/constants/wheel";

interface JoinSpinDialogProps {
  wheelName: string;
  remainingItems: number;
  initialName?: string;
  /** Spin request in flight. */
  pending: boolean;
  error: string | null;
  onSpin: (name: string) => void;
  /** Close without spinning (view results only). */
  onDismiss: () => void;
}

export function validateParticipantName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Please enter your name.";
  if (trimmed.length > MAX_PARTICIPANT_NAME_LENGTH) {
    return `Name must be at most ${MAX_PARTICIPANT_NAME_LENGTH} characters.`;
  }
  return null;
}

/**
 * Name entry + SPIN in one step. The parent closes it only after the spin
 * request succeeds; on failure it stays open with the name preserved.
 */
export function JoinSpinDialog({
  wheelName,
  remainingItems,
  initialName = "",
  pending,
  error,
  onSpin,
  onDismiss,
}: JoinSpinDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const invalid = validateParticipantName(name);
  const tooLong = name.trim().length > MAX_PARTICIPANT_NAME_LENGTH;

  useEffect(() => {
    // Focus on devices with a precise pointer; on phones, don't pop the keyboard over the dialog uninvited.
    if (window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onDismiss]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || invalid) return;
    onSpin(name.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-2 text-indigo-600">
            <span className="text-2xl" aria-hidden>
              🎉
            </span>
            <span className="text-lg font-extrabold tracking-tight">LuckySpin</span>
          </div>

          <div>
            <h2 id={titleId} className="text-xl font-bold text-gray-900 sm:text-2xl">
              Welcome to <span className="break-words">{wheelName}</span>
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Enter your name to join the wheel. {remainingItems} {remainingItems === 1 ? "prize" : "prizes"} left.
            </p>
          </div>

          <div className="flex w-full flex-col gap-1.5 text-left">
            <label htmlFor="join-name" className="sr-only">
              Your name
            </label>
            <input
              ref={inputRef}
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              maxLength={MAX_PARTICIPANT_NAME_LENGTH + 10}
              placeholder="Your name"
              autoComplete="nickname"
              enterKeyHint="go"
              aria-invalid={tooLong}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-lg text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50"
            />
            {tooLong && <p className="text-sm text-red-600">{invalid}</p>}
          </div>

          {error && (
            <p role="alert" className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || Boolean(invalid)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-4 text-lg font-extrabold uppercase tracking-widest text-white shadow-md transition hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {pending && (
              <span
                className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden
              />
            )}
            {pending ? "Spinning…" : "Spin"}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            disabled={pending}
            className="text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline disabled:opacity-50"
          >
            Just look at the results
          </button>
        </form>
      </div>
    </div>
  );
}

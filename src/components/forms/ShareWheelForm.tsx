"use client";

import { useState, type FormEvent } from "react";
import { MAX_WHEEL_NAME_LENGTH } from "@/constants/wheel";
import { ApiClientError, createWheel } from "@/lib/api-client";
import { validateNewOwnerPassword } from "@/lib/owner-password";

interface ShareWheelFormProps {
  items: string[];
  onClose: () => void;
}

export function ShareWheelForm({ items, onClose }: ShareWheelFormProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Wheel name is required.");
    if (trimmed.length > MAX_WHEEL_NAME_LENGTH) {
      return setError(`Wheel name must be at most ${MAX_WHEEL_NAME_LENGTH} characters.`);
    }
    const pwError = validateNewOwnerPassword(password, confirm);
    if (pwError) return setError(pwError);
    setSubmitting(true);
    setError(null);
    try {
      const data = await createWheel(trimmed, items, password, confirm);
      setShareUrl(data.shareUrl);
      // Don't keep the password around once it has been used.
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the wheel.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard API is unavailable on insecure origins; fall back to selection.
      const input = document.getElementById("share-url") as HTMLInputElement | null;
      input?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 id="share-title" className="text-xl font-bold text-gray-900">
            {shareUrl ? "Your wheel is ready" : "Share this wheel"}
          </h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="Close">
            ×
          </button>
        </div>

        {shareUrl ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">Anyone with this link can spin once.</p>
            <div className="flex gap-2">
              <input
                id="share-url"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900"
              />
              <button
                onClick={copy}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <a href={shareUrl} className="text-sm font-medium text-indigo-600 hover:underline">
              Open shared wheel →
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label htmlFor="wheel-name" className="text-sm font-semibold text-gray-700">
              Wheel name
            </label>
            <input
              id="wheel-name"
              autoFocus
              value={name}
              maxLength={MAX_WHEEL_NAME_LENGTH + 20}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lucky Draw - November"
              className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <label htmlFor="owner-password" className="mt-1 text-sm font-semibold text-gray-700">
              Owner password
            </label>
            <input
              id="owner-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <label htmlFor="owner-password-confirm" className="text-sm font-semibold text-gray-700">
              Confirm password
            </label>
            <input
              id="owner-password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <p className="text-xs text-gray-500">
              You&apos;ll need this password to edit the wheel or remove spins. It can&apos;t be recovered.
              {" "}{items.length} items will be saved.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:bg-gray-400"
            >
              {submitting ? "Creating…" : "Create share link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

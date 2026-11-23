"use client";

import { useState, type FormEvent } from "react";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/constants/wheel";

interface ParticipantFormProps {
  initialName?: string;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}

export function ParticipantForm({ initialName = "", onSubmit, onCancel }: ParticipantFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Please enter your name.");
    if (trimmed.length > MAX_PARTICIPANT_NAME_LENGTH) {
      return setError(`Name must be at most ${MAX_PARTICIPANT_NAME_LENGTH} characters.`);
    }
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
      <label htmlFor="participant-name" className="text-sm font-medium text-gray-700">
        Please enter your name before spinning.
      </label>
      <div className="flex gap-2">
        <input
          id="participant-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_PARTICIPANT_NAME_LENGTH + 10}
          placeholder="Your name"
          autoComplete="nickname"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
          Join
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

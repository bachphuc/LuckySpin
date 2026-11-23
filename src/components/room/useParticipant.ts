"use client";

import { useCallback, useSyncExternalStore } from "react";
import { participantStorageKey } from "@/constants/wheel";
import { newUuid } from "@/lib/client-id";

export interface StoredParticipant {
  participantId: string;
  name: string;
}

/**
 * Participant identity for one wheel, kept in localStorage so it survives refreshes.
 * Only identity lives here; wheel items and results always come from the backend.
 */
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: StoredParticipant | null }>();

function read(code: string): StoredParticipant | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(participantStorageKey(code));
  } catch {
    raw = null;
  }
  const cached = cache.get(code);
  if (cached && cached.raw === raw) return cached.value;
  let value: StoredParticipant | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.participantId === "string" && typeof parsed.name === "string") {
      value = { participantId: parsed.participantId, name: parsed.name };
    }
  } catch {
    value = null;
  }
  cache.set(code, { raw, value });
  return value;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useParticipant(code: string) {
  const participant = useSyncExternalStore(
    subscribe,
    () => read(code),
    () => null,
  );

  const save = useCallback(
    (name: string) => {
      const existing = read(code);
      const next: StoredParticipant = {
        participantId: existing?.participantId ?? newUuid(),
        name,
      };
      try {
        localStorage.setItem(participantStorageKey(code), JSON.stringify(next));
      } catch {
        // Storage blocked (private mode): keep it in memory for this page view.
        cache.set(code, { raw: JSON.stringify(next), value: next });
      }
      listeners.forEach((l) => l());
    },
    [code],
  );

  return { participant, saveParticipant: save };
}

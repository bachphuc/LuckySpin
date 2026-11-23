"use client";

import { useState } from "react";
import { MAX_ITEM_LENGTH, MAX_ITEMS, MAX_WHEEL_NAME_LENGTH } from "@/constants/wheel";
import { removeSpin, updateWheel, type WheelEdit } from "@/lib/api-client";
import type { PublicSpinResult, WheelResponse } from "@/types/wheel";
import { PasswordPrompt } from "./PasswordPrompt";

interface OwnerPanelProps {
  wheel: WheelResponse;
  onClose: () => void;
  /** Re-fetch the wheel after a successful change. */
  onChanged: () => void;
}

type Pending =
  | { kind: "save"; edit: WheelEdit; summary: string }
  | { kind: "remove"; result: PublicSpinResult };

/**
 * Owner management: changes are staged locally, then sent in one request after
 * the owner confirms with the password. Items are rendered from live wheel data,
 * so an item awarded while editing simply disappears from the list.
 */
export function OwnerPanel({ wheel, onClose, onChanged }: OwnerPanelProps) {
  const [name, setName] = useState(wheel.name);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const liveIds = new Set(wheel.items.map((i) => i.id));
  const updates = Object.entries(labels)
    .filter(([id]) => liveIds.has(id) && !removed.has(id))
    .map(([id, label]) => ({ id, label: label.trim() }))
    .filter((u) => u.label !== wheel.items.find((i) => i.id === u.id)?.label);
  const removeIds = [...removed].filter((id) => liveIds.has(id));
  const nameChanged = name.trim() !== wheel.name;
  const dirty = nameChanged || updates.length > 0 || removeIds.length > 0 || added.length > 0;
  const projectedTotal = wheel.totalItems - removeIds.length + added.length;

  function resetDrafts() {
    setLabels({});
    setRemoved(new Set());
    setAdded([]);
    setNewItem("");
  }

  function addItem() {
    const label = newItem.trim();
    if (!label) return;
    if (label.length > MAX_ITEM_LENGTH) return setFormError(`Items can be at most ${MAX_ITEM_LENGTH} characters.`);
    if (projectedTotal + 1 > MAX_ITEMS) return setFormError(`A wheel can have at most ${MAX_ITEMS} items.`);
    setFormError(null);
    setAdded((a) => [...a, label]);
    setNewItem("");
  }

  function startSave() {
    setNotice(null);
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError("Wheel name is required.");
    if (trimmedName.length > MAX_WHEEL_NAME_LENGTH) {
      return setFormError(`Wheel name must be at most ${MAX_WHEEL_NAME_LENGTH} characters.`);
    }
    if (updates.some((u) => !u.label)) return setFormError("Item labels can't be empty.");
    if (updates.some((u) => u.label.length > MAX_ITEM_LENGTH)) {
      return setFormError(`Items can be at most ${MAX_ITEM_LENGTH} characters.`);
    }
    setFormError(null);
    const edit: WheelEdit = {};
    const parts: string[] = [];
    if (nameChanged) {
      edit.name = trimmedName;
      parts.push("rename the wheel");
    }
    if (added.length) {
      edit.addItems = added;
      parts.push(`add ${added.length} item${added.length > 1 ? "s" : ""}`);
    }
    if (updates.length) {
      edit.updateItems = updates;
      parts.push(`edit ${updates.length} item${updates.length > 1 ? "s" : ""}`);
    }
    if (removeIds.length) {
      edit.removeItemIds = removeIds;
      parts.push(`remove ${removeIds.length} item${removeIds.length > 1 ? "s" : ""}`);
    }
    setPending({ kind: "save", edit, summary: parts.join(", ") });
  }

  async function confirm(password: string) {
    if (!pending) return;
    if (pending.kind === "save") {
      const updated = await updateWheel(wheel.code, password, pending.edit);
      resetDrafts();
      setName(updated.name);
      setNotice("Changes saved.");
    } else {
      const res = await removeSpin(wheel.code, pending.result.requestId, password);
      setNotice(
        `Removed ${res.removedResult.participantName}'s spin. "${res.removedResult.itemLabel}" is back on the wheel.`,
      );
    }
    setPending(null);
    onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-title"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="owner-title" className="text-lg font-bold text-gray-900">
              Owner management
            </h2>
            <p className="text-xs text-gray-500">Every change asks for the owner password.</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="Close">
            ×
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {notice && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Edit wheel</h3>
            <label htmlFor="owner-wheel-name" className="text-sm font-medium text-gray-700">
              Wheel name
            </label>
            <input
              id="owner-wheel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Manage items ({wheel.items.length - removeIds.length + added.length} available)
            </h3>
            <p className="mb-2 text-xs text-gray-500">
              Only available items can be changed. To change an awarded item, remove that spin first.
            </p>
            <ul className="space-y-2">
              {wheel.items.map((item) => {
                const isRemoved = removed.has(item.id);
                return (
                  <li key={item.id} className="flex items-center gap-2">
                    <input
                      aria-label={`Item ${item.label}`}
                      value={labels[item.id] ?? item.label}
                      disabled={isRemoved}
                      onChange={(e) => setLabels((l) => ({ ...l, [item.id]: e.target.value }))}
                      className={`min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-base text-gray-900 outline-none focus:border-indigo-500 ${
                        isRemoved ? "bg-gray-50 text-gray-400 line-through" : ""
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRemoved((r) => {
                          const next = new Set(r);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                      className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      {isRemoved ? "Undo" : "Remove"}
                    </button>
                  </li>
                );
              })}
              {added.map((label, i) => (
                <li key={`new-${i}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-3 py-1.5 text-base text-indigo-900">
                    {label} <span className="text-xs text-indigo-500">(new)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdded((a) => a.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="New item"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
                placeholder="New item"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-base text-gray-900 outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addItem}
                className="shrink-0 rounded-lg border border-indigo-600 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                Add
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Participants & results ({wheel.results.length})
            </h3>
            {wheel.results.length === 0 ? (
              <p className="text-sm text-gray-500">Nobody has spun yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {wheel.results.map((r) => (
                  <li key={r.requestId} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{r.participantName}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-700">🎁 {r.itemLabel}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null);
                        setPending({ kind: "remove", result: r });
                      }}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove spin
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          {formError && (
            <p role="alert" className="text-sm text-red-600 sm:mr-auto">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              resetDrafts();
              setName(wheel.name);
              setFormError(null);
            }}
            disabled={!dirty}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={startSave}
            disabled={!dirty}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-gray-300"
          >
            Save changes
          </button>
        </footer>
      </div>

      {pending?.kind === "save" && (
        <PasswordPrompt
          title="Save changes"
          description={`Enter the owner password to ${pending.summary}.`}
          confirmLabel="Save"
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === "remove" && (
        <PasswordPrompt
          title={`Remove ${pending.result.participantName}'s spin?`}
          description={`"${pending.result.itemLabel}" goes back on the wheel and ${pending.result.participantName} can spin again.`}
          confirmLabel="Remove spin"
          danger
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

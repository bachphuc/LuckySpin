"use client";

import { useMemo, useRef, useState } from "react";
import { ItemInput } from "@/components/forms/ItemInput";
import { ShareWheelForm } from "@/components/forms/ShareWheelForm";
import { SpinButton } from "@/components/wheel/SpinButton";
import { Wheel, type WheelHandle } from "@/components/wheel/Wheel";
import { parseItemLines, validateItemLabels } from "@/lib/items";
import type { WheelItem } from "@/types/wheel";

const SAMPLE = ["Apple", "Banana", "Orange", "Mango", "Grape", "Cherry"].join("\n");

/** Local-only items get index-based ids; real ids are assigned by the server on share. */
const toPreviewItems = (labels: string[]): WheelItem[] =>
  labels.map((label, i) => ({ id: `preview-${i}`, label }));

export function HomeWheel() {
  const [text, setText] = useState(SAMPLE);
  const [items, setItems] = useState<WheelItem[]>(() => toPreviewItems(parseItemLines(SAMPLE)));
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const wheelRef = useRef<WheelHandle>(null);

  const parsed = useMemo(() => parseItemLines(text), [text]);
  const dirty = parsed.join("\n") !== items.map((i) => i.label).join("\n");

  /** Validate the textarea and load it into the preview. Returns the labels if valid. */
  function applyItems(): string[] | null {
    const problem = validateItemLabels(parsed);
    setError(problem);
    if (problem) return null;
    if (dirty) {
      setItems(toPreviewItems(parsed));
      setWinner(null);
    }
    return parsed;
  }

  async function spin() {
    if (spinning) return;
    const labels = applyItems();
    if (!labels) return;
    setSpinning(true);
    setWinner(null);
    // Local preview only: nothing is saved, so a client-side random pick is fine here.
    const index = crypto.getRandomValues(new Uint32Array(1))[0] % labels.length;
    // Let React commit the (possibly) new items before animating.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await wheelRef.current?.stopAt(index);
    setWinner(labels[index]);
    setSpinning(false);
  }

  function openShare() {
    if (applyItems()) setSharing(true);
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 md:grid-cols-[minmax(0,1fr)_360px] md:py-10">
      <section className="flex flex-col items-center gap-5">
        <Wheel ref={wheelRef} items={items} className="w-full max-w-[520px]" />
        <div className="min-h-14 text-center" aria-live="polite">
          {winner && (
            <p className="rounded-xl bg-amber-100 px-5 py-3 text-xl font-bold text-amber-900">
              🎉 {winner}
            </p>
          )}
        </div>
        <SpinButton onClick={spin} spinning={spinning} />
        <p className="text-xs text-gray-500">Local preview: results are not saved.</p>
      </section>

      <aside className="flex flex-col gap-4">
        <ItemInput value={text} onChange={setText} count={parsed.length} error={error} />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={applyItems}
            disabled={spinning}
            className="flex-1 rounded-xl border border-indigo-600 px-4 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            {dirty ? "Create wheel" : "Wheel up to date"}
          </button>
          <button
            type="button"
            onClick={openShare}
            disabled={spinning}
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Share
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Share saves the wheel and gives you a link. Each person who opens it can spin once, and
          every prize is handed out only once.
        </p>
      </aside>

      {sharing && <ShareWheelForm items={parsed} onClose={() => setSharing(false)} />}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { JoinSpinDialog } from "@/components/participants/JoinSpinDialog";
import { ParticipantList } from "@/components/participants/ParticipantList";
import { ResultList } from "@/components/results/ResultList";
import { SpinButton } from "@/components/wheel/SpinButton";
import { Wheel, type WheelHandle } from "@/components/wheel/Wheel";
import { POLL_INTERVAL_MS } from "@/constants/wheel";
import { ApiClientError, fetchWheel, spinWheel } from "@/lib/api-client";
import { newUuid } from "@/lib/client-id";
import type { WheelItem, WheelResponse } from "@/types/wheel";
import { useParticipant } from "./useParticipant";

interface JustWon {
  participantName: string;
  itemLabel: string;
}

/** Keep the landed wheel (winner under the pointer) on screen briefly before showing live items. */
const RESULT_HOLD_MS = 4000;

export function WheelRoom({ code }: { code: string }) {
  const [wheel, setWheel] = useState<WheelResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinItems, setSpinItems] = useState<WheelItem[] | null>(null);
  const [justWon, setJustWon] = useState<JustWon | null>(null);
  /** Spin request in flight from the dialog (before the animation starts). */
  const [spinPending, setSpinPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  /** User chose to only watch; the dialog reopens from the main Spin button. */
  const [watching, setWatching] = useState(false);
  const { participant, saveParticipant } = useParticipant(code);

  const wheelRef = useRef<WheelHandle>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const spinningRef = useRef(false);
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);

  /**
   * Fetch the wheel from the backend (the source of truth).
   * - never overlaps with itself (unless forced after a spin)
   * - drops responses older than one already applied
   */
  const refresh = useCallback(
    async (opts: { force?: boolean; signal?: AbortSignal } = {}) => {
      if (!opts.force && (inFlight.current || spinningRef.current)) return;
      inFlight.current = true;
      const seq = ++requestSeq.current;
      try {
        const data = await fetchWheel(code, opts.signal);
        // Ignore stale responses, and never reveal the result mid-animation.
        if (seq < appliedSeq.current || (spinningRef.current && !opts.force)) return;
        appliedSeq.current = seq;
        setWheel(data);
        setNotFound(false);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        if (err instanceof ApiClientError && err.code === "WHEEL_NOT_FOUND") setNotFound(true);
        // Transient polling errors are ignored; the next poll will try again.
      } finally {
        if (seq === requestSeq.current) inFlight.current = false;
        setIsLoading(false);
      }
    },
    [code],
  );

  useEffect(() => {
    const controller = new AbortController();
    const poll = () => {
      if (document.visibilityState === "hidden") return;
      void refresh({ signal: controller.signal });
    };
    const initial = setTimeout(() => void refresh({ signal: controller.signal }), 0);
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      clearTimeout(initial);
      clearInterval(id);
      controller.abort();
    };
  }, [refresh]);

  const myResult =
    participant && wheel ? wheel.results.find((r) => r.participantId === participant.participantId) : undefined;
  const isCompleted = wheel?.status === "COMPLETED";
  const showDialog = Boolean(
    wheel && !isCompleted && !myResult && !justWon && !isSpinning && !watching,
  );

  /**
   * Spin from the join dialog: save the name (reusing any stored participantId),
   * call the existing spin API, and only then close the dialog and animate the
   * wheel onto the item the backend chose.
   */
  async function handleDialogSpin(name: string) {
    if (!wheel || spinningRef.current) return;
    const me = saveParticipant(name);
    spinningRef.current = true; // also pauses polling so the wheel can't change under us
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const frozen = wheel.items;
    setSpinItems(frozen);
    setSpinPending(true);
    setDialogError(null);
    setError(null);
    setJustWon(null);

    let data;
    try {
      data = await spinWheel(code, {
        participantId: me.participantId,
        participantName: me.name,
        requestId: newUuid(),
      });
    } catch (err) {
      // Keep the dialog open with the name intact; no fake result.
      spinningRef.current = false;
      setSpinItems(null);
      setSpinPending(false);
      setDialogError(err instanceof ApiClientError ? err.message : "Spin failed. Please try again.");
      await refresh({ force: true }); // e.g. already spun / completed: the page state catches up
      return;
    }

    setSpinPending(false);
    setIsSpinning(true); // closes the dialog
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const index = frozen.findIndex((i) => i.id === data.result.itemId);
      if (index >= 0) {
        await wheelRef.current?.stopAt(index);
      }
      setJustWon({ participantName: data.result.participantName, itemLabel: data.result.itemLabel });
      holdTimer.current = setTimeout(() => setSpinItems(null), RESULT_HOLD_MS);
    } finally {
      spinningRef.current = false;
      setIsSpinning(false);
      await refresh({ force: true });
    }
  }

  if (isLoading && !wheel) {
    return <RoomMessage title="Loading wheel…" />;
  }
  if (notFound) {
    return <RoomMessage title="Wheel not found" body="Check the link and try again." />;
  }
  if (!wheel) {
    return <RoomMessage title="Couldn't load this wheel" body="Retrying automatically…" />;
  }

  const displayItems = spinItems ?? wheel.items;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 md:grid-cols-[minmax(0,1fr)_360px] md:py-10">
      <section className="flex flex-col items-center gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">{wheel.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {isCompleted ? (
              <span className="font-semibold text-emerald-700">Completed: all {wheel.totalItems} items awarded</span>
            ) : (
              <>
                <span className="font-semibold">{wheel.remainingItems}</span> of {wheel.totalItems} items remaining
              </>
            )}
          </p>
        </div>

        {isCompleted && !spinItems ? (
          <div className="flex aspect-square w-full max-w-[420px] flex-col items-center justify-center rounded-full border-8 border-gray-800 bg-gradient-to-br from-emerald-100 to-indigo-100 text-center">
            <span className="text-5xl">🏁</span>
            <p className="mt-2 text-xl font-bold text-gray-900">All prizes awarded</p>
            <p className="text-sm text-gray-600">This wheel no longer accepts spins.</p>
          </div>
        ) : (
          <Wheel ref={wheelRef} items={displayItems} className="w-full max-w-[520px]" />
        )}

        <div className="min-h-14 w-full max-w-md text-center" aria-live="polite">
          {justWon ? (
            <p className="rounded-xl bg-amber-100 px-5 py-3 text-lg font-bold text-amber-900">
              🎉 Congratulations, {justWon.participantName}! You won {justWon.itemLabel}.
            </p>
          ) : myResult && !isSpinning ? (
            <p className="rounded-xl bg-indigo-50 px-5 py-3 text-base text-indigo-900">
              You already spun and won <span className="font-bold">{myResult.itemLabel}</span>.
            </p>
          ) : null}
          {error && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {!isCompleted && (
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <SpinButton
              onClick={() => {
                setDialogError(null);
                setWatching(false);
              }}
              disabled={Boolean(myResult) || showDialog}
              spinning={isSpinning || spinPending}
              label={myResult ? "Already spun" : participant ? "Spin" : "Join & spin"}
            />
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-6">
        <ResultList results={wheel.results} currentParticipantId={participant?.participantId ?? null} />
        <ParticipantList
          participants={wheel.participants}
          currentParticipantId={participant?.participantId ?? null}
        />
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Remaining items ({wheel.remainingItems})
          </h3>
          {wheel.items.length === 0 ? (
            <p className="text-sm text-gray-500">None left.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {wheel.items.map((item) => (
                <li key={item.id} className="rounded-md bg-white px-2 py-0.5 text-sm text-gray-800 ring-1 ring-gray-200">
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
      {showDialog && (
        <JoinSpinDialog
          wheelName={wheel.name}
          remainingItems={wheel.remainingItems}
          initialName={participant?.name}
          pending={spinPending}
          error={dialogError}
          onSpin={handleDialogSpin}
          onDismiss={() => setWatching(true)}
        />
      )}
    </div>
  );
}

function RoomMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-24 text-center">
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      {body && <p className="text-gray-600">{body}</p>}
      {title === "Wheel not found" && (
        <Link href="/" className="mt-2 font-medium text-indigo-600 hover:underline">
          Create a new wheel
        </Link>
      )}
    </div>
  );
}

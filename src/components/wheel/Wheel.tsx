"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { segmentAngle, segmentColor, targetRotation } from "@/lib/wheel-geometry";
import type { WheelItem } from "@/types/wheel";
import { WheelSegment } from "./WheelSegment";

export interface WheelHandle {
  /** Start spinning freely while waiting for a result. */
  start(): void;
  /** Decelerate and land on items[index]. Resolves when the wheel has stopped. */
  stopAt(index: number): Promise<void>;
  /** Abort (e.g. API error): ease to a quick stop without picking anything. */
  cancel(): void;
}

interface WheelProps {
  items: WheelItem[];
  ref?: Ref<WheelHandle>;
  /** Rendered in the hub, e.g. a spin button. */
  className?: string;
}

const SIZE = 400;
const C = SIZE / 2;
const R = SIZE / 2 - 8;
const MAX_SPEED = 900; // deg/s
const ACCEL = 1800; // deg/s²

type Mode =
  | { kind: "idle" }
  | { kind: "free"; last: number }
  | {
      kind: "stopping";
      startTime: number;
      startAngle: number;
      distance: number;
      duration: number;
      resolve: () => void;
    };

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function Wheel({ items, ref, className }: WheelProps) {
  const groupRef = useRef<SVGGElement>(null);
  const angleRef = useRef(0);
  const speedRef = useRef(0);
  const modeRef = useRef<Mode>({ kind: "idle" });
  const rafRef = useRef<number | null>(null);

  const apply = () => {
    groupRef.current?.setAttribute("transform", `rotate(${angleRef.current % 360} ${C} ${C})`);
  };

  const tick = (now: number) => {
    const mode = modeRef.current;
    if (mode.kind === "free") {
      const dt = Math.min((now - mode.last) / 1000, 0.05);
      speedRef.current = Math.min(MAX_SPEED, speedRef.current + ACCEL * dt);
      angleRef.current += speedRef.current * dt;
      mode.last = now;
    } else if (mode.kind === "stopping") {
      const t = Math.min((now - mode.startTime) / mode.duration, 1);
      angleRef.current = mode.startAngle + mode.distance * easeOutCubic(t);
      if (t >= 1) {
        speedRef.current = 0;
        modeRef.current = { kind: "idle" };
        apply();
        rafRef.current = null;
        mode.resolve();
        return;
      }
    } else {
      rafRef.current = null;
      return;
    }
    apply();
    rafRef.current = requestAnimationFrame(tick);
  };

  const ensureLoop = () => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  };

  const beginStop = (target: number): Promise<void> =>
    new Promise((resolve) => {
      const distance = target - angleRef.current;
      const speed = speedRef.current;
      // Match the starting velocity of the ease-out curve to the current speed
      // (easeOutCubic'(0) = 3) so the hand-off from free spin is smooth.
      let duration = speed > 1 ? (3 * distance) / speed : 4500;
      duration = Math.min(Math.max(duration, 2500), 7000);
      if (prefersReducedMotion()) duration = Math.min(duration, 1200);
      modeRef.current = {
        kind: "stopping",
        startTime: performance.now(),
        startAngle: angleRef.current,
        distance,
        duration,
        resolve,
      };
      ensureLoop();
    });

  useImperativeHandle(ref, () => ({
    start() {
      speedRef.current = Math.max(speedRef.current, 120);
      modeRef.current = { kind: "free", last: performance.now() };
      ensureLoop();
    },
    stopAt(index: number) {
      const jitter = (Math.random() - 0.5) * 0.7; // stay well inside the segment
      const turns = speedRef.current > 1 ? 2 : 4;
      return beginStop(targetRotation(angleRef.current, index, items.length, jitter, turns));
    },
    cancel() {
      if (modeRef.current.kind === "idle") return;
      const extra = Math.max(60, speedRef.current * 0.4);
      const startAngle = angleRef.current;
      modeRef.current = {
        kind: "stopping",
        startTime: performance.now(),
        startAngle,
        distance: extra,
        duration: 800,
        resolve: () => {},
      };
      ensureLoop();
    },
  }));

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const count = items.length;
  const seg = segmentAngle(count);
  const fontSize = count <= 6 ? 18 : count <= 12 ? 15 : count <= 24 ? 12 : count <= 48 ? 9 : 7;
  const maxChars = count <= 12 ? 18 : 22;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE + 14}`}
        className="h-auto w-full select-none drop-shadow-xl"
        role="img"
        aria-label={`Wheel with ${count} items`}
      >
        <g transform="translate(0 14)">
          <circle cx={C} cy={C} r={R + 6} fill="#1f2937" />
          <g ref={groupRef} transform={`rotate(0 ${C} ${C})`}>
            {count === 0 ? (
              <circle cx={C} cy={C} r={R} fill="#e5e7eb" />
            ) : (
              items.map((item, i) => (
                <WheelSegment
                  key={item.id}
                  label={item.label}
                  color={segmentColor(i, count)}
                  startDeg={i * seg}
                  endDeg={(i + 1) * seg}
                  cx={C}
                  cy={C}
                  r={R}
                  fontSize={fontSize}
                  maxChars={maxChars}
                  fullCircle={count === 1}
                />
              ))
            )}
          </g>
          <circle cx={C} cy={C} r={22} fill="white" stroke="#1f2937" strokeWidth={4} />
        </g>
        {/* Pointer at 12 o'clock */}
        <polygon points={`${C - 16},2 ${C + 16},2 ${C},40`} fill="#111827" stroke="white" strokeWidth={3} />
      </svg>
    </div>
  );
}

import { SEGMENT_COLORS } from "@/constants/wheel";

/**
 * Angles are in degrees, measured clockwise from 12 o'clock, where the pointer sits.
 */

export function segmentAngle(count: number): number {
  return 360 / Math.max(count, 1);
}

/** Avoid two neighbouring segments sharing a colour where the wheel wraps around. */
export function segmentColor(index: number, count: number): string {
  const n = SEGMENT_COLORS.length;
  if (count > 1 && index === count - 1 && (count - 1) % n === 0) {
    return SEGMENT_COLORS[(index + 1) % n];
  }
  return SEGMENT_COLORS[index % n];
}

export function pointOnCircle(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  // Round so server and browser trig produce identical SVG (avoids hydration mismatches).
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { x: round(cx + r * Math.sin(rad)), y: round(cy - r * Math.cos(rad)) };
}

export function segmentPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = pointOnCircle(cx, cy, r, startDeg);
  const end = pointOnCircle(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Final wheel rotation that lands segment `index` under the pointer.
 * `offsetWithinSegment` is in [-0.5, 0.5] (fraction of a segment from its centre)
 * so the wheel doesn't always stop dead-centre. At least `minExtraTurns` full turns
 * are added on top of the current rotation.
 */
export function targetRotation(
  currentRotation: number,
  index: number,
  count: number,
  offsetWithinSegment = 0,
  minExtraTurns = 2,
): number {
  const seg = segmentAngle(count);
  const landingAngle = (index + 0.5 + offsetWithinSegment) * seg;
  const desired = mod360(-landingAngle);
  const base = currentRotation + minExtraTurns * 360;
  return base + mod360(desired - base);
}

/** Which segment sits under the pointer for a given rotation. */
export function indexAtPointer(rotation: number, count: number): number {
  const seg = segmentAngle(count);
  return Math.floor(mod360(-rotation) / seg) % count;
}

export function truncateLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

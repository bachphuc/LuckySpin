import { segmentPath, truncateLabel } from "@/lib/wheel-geometry";

interface WheelSegmentProps {
  label: string;
  color: string;
  startDeg: number;
  endDeg: number;
  cx: number;
  cy: number;
  r: number;
  fontSize: number;
  maxChars: number;
  fullCircle: boolean;
}

export function WheelSegment({
  label,
  color,
  startDeg,
  endDeg,
  cx,
  cy,
  r,
  fontSize,
  maxChars,
  fullCircle,
}: WheelSegmentProps) {
  const mid = (startDeg + endDeg) / 2;
  return (
    <g>
      <title>{label}</title>
      {fullCircle ? (
        <circle cx={cx} cy={cy} r={r} fill={color} stroke="white" strokeWidth={2} />
      ) : (
        <path d={segmentPath(cx, cy, r, startDeg, endDeg)} fill={color} stroke="white" strokeWidth={2} />
      )}
      {/* Rotate so the text runs along the radius, reading outward from the hub. */}
      <g transform={`rotate(${mid - 90} ${cx} ${cy})`}>
        <text
          x={cx + r - 14}
          y={cy}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={600}
          fill="white"
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.25)", strokeWidth: 2 }}
        >
          {truncateLabel(label, maxChars)}
        </text>
      </g>
    </g>
  );
}

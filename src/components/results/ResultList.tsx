import type { PublicSpinResult } from "@/types/wheel";

interface ResultListProps {
  results: PublicSpinResult[];
  currentParticipantId: string | null;
}

export function ResultList({ results, currentParticipantId }: ResultListProps) {
  const ordered = [...results].reverse(); // newest first
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Results ({results.length})
      </h3>
      {ordered.length === 0 ? (
        <p className="text-sm text-gray-500">No results yet.</p>
      ) : (
        <ol className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {ordered.map((r) => (
            <li
              key={r.itemId}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                r.participantId === currentParticipantId ? "bg-indigo-50" : ""
              }`}
            >
              <span className="min-w-0 truncate font-medium text-gray-900">{r.participantName}</span>
              <span className="min-w-0 truncate text-right text-gray-700">
                🎁 {r.itemLabel}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

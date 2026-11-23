import type { PublicParticipant } from "@/types/wheel";

interface ParticipantListProps {
  participants: PublicParticipant[];
  currentParticipantId: string | null;
}

export function ParticipantList({ participants, currentParticipantId }: ParticipantListProps) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Participants ({participants.length})
      </h3>
      {participants.length === 0 ? (
        <p className="text-sm text-gray-500">Nobody has spun yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {participants.map((p) => (
            <li
              key={p.participantId}
              className={`rounded-full px-3 py-1 text-sm ${
                p.participantId === currentParticipantId
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

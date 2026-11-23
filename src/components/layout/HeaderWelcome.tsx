"use client";

import { usePathname } from "next/navigation";
import { useParticipant } from "@/components/room/useParticipant";

/** Shows "Welcome {name}" on shared wheel pages once this browser has joined that wheel. */
export function HeaderWelcome() {
  const pathname = usePathname();
  const code = pathname?.match(/^\/w\/([^/]+)/)?.[1] ?? null;
  return code ? <WelcomeForWheel code={code} /> : null;
}

function WelcomeForWheel({ code }: { code: string }) {
  const { participant } = useParticipant(code);
  if (!participant) return null;
  return (
    <p className="ml-auto min-w-0 max-w-[55%] truncate text-sm text-gray-600" title={participant.name}>
      Welcome <span className="font-semibold text-gray-900">{participant.name}</span>
    </p>
  );
}

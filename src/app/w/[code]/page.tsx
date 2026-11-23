import { Suspense } from "react";
import { WheelRoom } from "@/components/room/WheelRoom";

export default function SharedWheelPage({ params }: PageProps<"/w/[code]">) {
  // With Cache Components, route params are runtime data and must sit under Suspense.
  return (
    <Suspense fallback={<p className="py-24 text-center text-gray-600">Loading wheel…</p>}>
      {params.then(({ code }) => (
        <WheelRoom key={code} code={code} />
      ))}
    </Suspense>
  );
}

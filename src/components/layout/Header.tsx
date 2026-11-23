import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
            <circle cx="16" cy="16" r="15" fill="#6366f1" />
            <path d="M16 16 L16 1 A15 15 0 0 1 29 8.5 Z" fill="#f97316" />
            <path d="M16 16 L29 23.5 A15 15 0 0 1 16 31 Z" fill="#22c55e" />
            <path d="M16 16 L3 23.5 A15 15 0 0 1 3 8.5 Z" fill="#eab308" />
            <circle cx="16" cy="16" r="3.5" fill="white" />
          </svg>
          <span className="text-xl font-extrabold tracking-tight text-gray-900">LuckySpin</span>
        </Link>
      </div>
    </header>
  );
}

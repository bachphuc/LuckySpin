import { MAX_ITEMS } from "@/constants/wheel";

interface ItemInputProps {
  value: string;
  onChange: (value: string) => void;
  count: number;
  error: string | null;
}

export function ItemInput({ value, onChange, count, error }: ItemInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="items" className="text-sm font-semibold text-gray-700">
          Items (one per line)
        </label>
        <span className={`text-xs ${count > MAX_ITEMS ? "text-red-600" : "text-gray-500"}`}>
          {count} / {MAX_ITEMS}
        </span>
      </div>
      <textarea
        id="items"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={"Apple\nBanana\nOrange"}
        className="min-h-48 w-full resize-y rounded-xl border border-gray-300 bg-white p-3 font-mono text-base text-gray-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "items-error" : undefined}
      />
      {error && (
        <p id="items-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

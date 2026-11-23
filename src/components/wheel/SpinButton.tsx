interface SpinButtonProps {
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
  label?: string;
}

export function SpinButton({ onClick, disabled, spinning, label = "Spin" }: SpinButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || spinning}
      className="w-full rounded-xl bg-indigo-600 px-6 py-3 text-lg font-bold tracking-wide text-white shadow-md transition hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto sm:min-w-48"
    >
      {spinning ? "Spinning…" : label}
    </button>
  );
}

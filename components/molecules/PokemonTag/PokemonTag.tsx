interface PokemonTagProps {
  pokemon: string;
  onRemove: (pokemon: string) => void;
}

export function PokemonTag({ pokemon, onRemove }: PokemonTagProps) {
  return (
    <button
      onClick={() => onRemove(pokemon)}
      className="group inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 transition-all hover:bg-red-200 sm:text-sm"
    >
      <span>{pokemon}</span>
      <svg
        className="h-3 w-3 text-red-600 group-hover:text-red-800 sm:h-4 sm:w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  );
}

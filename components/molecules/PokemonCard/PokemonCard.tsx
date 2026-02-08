import { Typography } from '@/components/atoms';
import { TypeBadge } from '@/components/molecules';
import { StatCard } from '@/components/molecules';
import { MovesSection } from '@/components/molecules';
import { useTheme } from '@/hooks/useTheme';
import type { Pokemon } from '@/lib/types';

interface PokemonCardProps {
  pokemon: Pokemon;
}

export function PokemonCard({ pokemon }: PokemonCardProps) {
  const { theme } = useTheme();

  const cardClasses =
    theme === 'dark'
      ? 'rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 p-4 shadow-sm transition-shadow hover:shadow-lg sm:p-5'
      : 'rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 shadow-sm transition-shadow hover:shadow-lg sm:p-5';

  const nameClasses =
    theme === 'dark'
      ? 'text-lg font-bold text-gray-100 sm:text-xl'
      : 'text-lg font-bold text-gray-900 sm:text-xl';

  const dexClasses =
    theme === 'dark'
      ? 'mt-1 block text-xs text-gray-400 sm:text-sm'
      : 'mt-1 block text-xs text-gray-500 sm:text-sm';

  const shadowClasses =
    theme === 'dark'
      ? 'mt-3 inline-block rounded bg-purple-800 px-3 py-1 text-xs font-bold text-purple-200'
      : 'mt-3 inline-block rounded bg-purple-900 px-3 py-1 text-xs font-bold text-purple-100';

  return (
    <div className={cardClasses}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <Typography variant="h3" className={nameClasses}>
            {pokemon.speciesName}
          </Typography>
          <Typography variant="span" className={dexClasses}>
            Dex #{pokemon.dex}
          </Typography>
        </div>
        <div className="flex flex-wrap gap-2">
          {pokemon.types.map((type, typeIndex) => (
            <TypeBadge key={typeIndex} type={type} />
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs sm:gap-3 sm:text-sm">
        <StatCard label="Attack" value={pokemon.baseStats.atk} color="red" />
        <StatCard label="Defense" value={pokemon.baseStats.def} color="blue" />
        <StatCard label="HP" value={pokemon.baseStats.hp} color="green" />
      </div>

      <MovesSection
        fastMove={pokemon.recommendedMoveset?.fastMove || undefined}
        chargedMove1={pokemon.recommendedMoveset?.chargedMove1 || undefined}
        chargedMove2={pokemon.recommendedMoveset?.chargedMove2 || undefined}
      />

      {pokemon.tags?.includes('shadow') && (
        <div className={shadowClasses}>SHADOW</div>
      )}
    </div>
  );
}

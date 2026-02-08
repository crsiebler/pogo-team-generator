import { TeamManager } from '@/components/organisms';
import { getGreatLeaguePokemon } from '@/lib/data/pokemon';

export default function Page() {
  const availablePokemon = getGreatLeaguePokemon();
  const pokemonNames = availablePokemon.map((p) => p.speciesName);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="mb-8 text-center sm:mb-12">
        <h1 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
          Pokémon GO PvP Team Generator
        </h1>
        <p className="text-base text-gray-600 sm:text-lg lg:text-xl">
          Generate optimized teams for competitive PvP using genetic algorithms
        </p>
      </header>

      <TeamManager pokemonList={pokemonNames} />
    </main>
  );
}

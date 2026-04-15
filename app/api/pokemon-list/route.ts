import { NextResponse } from 'next/server';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFrontierFormatId,
  isBattleFormatId,
} from '@/lib/data/battleFormats';
import { getBattleFrontierMasterPointsForSpecies } from '@/lib/data/battleFrontierMasterRules';
import {
  isBattleFrontierBannedSpeciesId,
  speciesNameToChoosableId,
} from '@/lib/data/pokemon';
import { getRankedPokemonNames } from '@/lib/data/rankings';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const formatParam = url.searchParams.get('formatId');
    const formatId = formatParam ?? DEFAULT_BATTLE_FORMAT_ID;

    if (!isBattleFormatId(formatId)) {
      return NextResponse.json(
        { error: `Invalid battle format: ${formatId}` },
        { status: 400 },
      );
    }

    const pokemonNames = Array.from(getRankedPokemonNames(formatId)).filter(
      (pokemonName) => {
        if (!isBattleFrontierFormatId(formatId)) {
          return true;
        }

        const speciesId = speciesNameToChoosableId(pokemonName);

        return !speciesId || !isBattleFrontierBannedSpeciesId(speciesId);
      },
    );

    const battleFrontierMasterPointsByPokemonName =
      formatId === 'battle-frontier-master'
        ? Object.fromEntries(
            pokemonNames.map((pokemonName) => {
              const speciesId = speciesNameToChoosableId(pokemonName);

              return [
                pokemonName,
                speciesId
                  ? getBattleFrontierMasterPointsForSpecies(speciesId)
                  : 0,
              ];
            }),
          )
        : undefined;

    return NextResponse.json({
      pokemon: pokemonNames,
      count: pokemonNames.length,
      battleFrontierMasterPointsByPokemonName,
    });
  } catch (error) {
    console.error('Error fetching Pokémon list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pokémon list' },
      { status: 500 },
    );
  }
}

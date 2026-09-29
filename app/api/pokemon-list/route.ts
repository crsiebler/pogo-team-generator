import { NextResponse } from 'next/server';
import {
  assertBattleFormatAvailable,
  BattleFormatUnavailableError,
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFrontierFormatId,
  isBattleFormatId,
} from '@/lib/data/battleFormats';
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

    assertBattleFormatAvailable(formatId);
    const pokemonNames = Array.from(getRankedPokemonNames(formatId)).filter(
      (pokemonName) => {
        if (!isBattleFrontierFormatId(formatId)) {
          return true;
        }

        const speciesId = speciesNameToChoosableId(pokemonName);

        if (!speciesId) {
          return false;
        }

        return !isBattleFrontierBannedSpeciesId(speciesId);
      },
    );

    return NextResponse.json({
      pokemon: pokemonNames,
      count: pokemonNames.length,
    });
  } catch (error) {
    if (error instanceof BattleFormatUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error fetching Pokémon list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pokémon list' },
      { status: 500 },
    );
  }
}

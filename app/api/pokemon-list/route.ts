import { NextResponse } from 'next/server';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFormatId,
} from '@/lib/data/battleFormats';
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

    const pokemonNames = Array.from(getRankedPokemonNames(formatId));

    return NextResponse.json({
      pokemon: pokemonNames,
      count: pokemonNames.length,
    });
  } catch (error) {
    console.error('Error fetching Pokémon list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Pokémon list' },
      { status: 500 },
    );
  }
}

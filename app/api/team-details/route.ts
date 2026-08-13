import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFormatId,
} from '@/lib/data/battleFormats';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import {
  getAssignedMovesetDetails,
  parseRosterMovesetAssignment,
  RosterMovesetAssignmentValidationError,
  validateRosterMovesetAssignmentAuthority,
} from '@/lib/genetic/moveset';

const MAX_TEAM_DETAILS_REQUEST_BYTES = 16_384;

export async function POST(request: NextRequest) {
  try {
    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader !== null) {
      if (!/^\d+$/.test(contentLengthHeader)) {
        return NextResponse.json(
          { error: 'Invalid Content-Length header.' },
          { status: 400 },
        );
      }

      const contentLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(contentLength)) {
        return NextResponse.json(
          { error: 'Invalid Content-Length header.' },
          { status: 400 },
        );
      }

      if (contentLength > MAX_TEAM_DETAILS_REQUEST_BYTES) {
        return NextResponse.json(
          { error: 'Team details request is too large.' },
          { status: 413 },
        );
      }
    }

    const reader = request.body?.getReader();
    if (!reader) {
      throw new SyntaxError('Team details request body is missing.');
    }

    const decoder = new TextDecoder();
    let bodyBytes = 0;
    let bodyText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      bodyBytes += value.byteLength;
      if (bodyBytes > MAX_TEAM_DETAILS_REQUEST_BYTES) {
        await reader.cancel();
        return NextResponse.json(
          { error: 'Team details request is too large.' },
          { status: 413 },
        );
      }

      bodyText += decoder.decode(value, { stream: true });
    }

    bodyText += decoder.decode();
    const body = JSON.parse(bodyText) as unknown;
    const { team, formatId, movesetAssignment } = body as {
      team: string[];
      formatId?: string;
      movesetAssignment?: unknown;
    };
    const resolvedFormatId = formatId ?? DEFAULT_BATTLE_FORMAT_ID;

    if (
      !Array.isArray(team) ||
      team.some((speciesId) => typeof speciesId !== 'string')
    ) {
      return NextResponse.json({ error: 'Invalid team data' }, { status: 400 });
    }

    if (!isBattleFormatId(resolvedFormatId)) {
      return NextResponse.json(
        { error: `Invalid battle format: ${resolvedFormatId}` },
        { status: 400 },
      );
    }

    const parsedAssignment = parseRosterMovesetAssignment(
      movesetAssignment,
      team,
      resolvedFormatId,
    );
    const assignment =
      validateRosterMovesetAssignmentAuthority(parsedAssignment);

    console.log('Team details requested for:', team);
    console.log('Team size:', team.length);

    const pokemonData = team
      .map((speciesId) => {
        const pokemon = getPokemonBySpeciesId(speciesId);
        if (!pokemon) {
          console.warn(`Pokemon not found: ${speciesId}`);
          return null;
        }

        return {
          ...pokemon,
          recommendedMoveset: getAssignedMovesetDetails(
            assignment,
            pokemon.speciesId,
          ),
        };
      })
      .filter(Boolean);

    console.log('Returning pokemon data, count:', pokemonData.length);

    return NextResponse.json({
      pokemon: pokemonData,
    });
  } catch (error) {
    if (error instanceof RosterMovesetAssignmentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('Error fetching team details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team details' },
      { status: 500 },
    );
  }
}

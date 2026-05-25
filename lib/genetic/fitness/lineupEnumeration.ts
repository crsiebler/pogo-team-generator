import type { OrderedLineup } from '@/lib/types';

const PLAY_POKEMON_ROSTER_SIZE = 6;
const LINEUP_KEY_DELIMITER = '|';

/** Validation failure for PlayPokemon bring-6 roster enumeration input. */
export class PlayPokemonRosterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayPokemonRosterValidationError';
  }
}

/** Builds a stable identity for an ordered pick-3 lineup. */
export function getPlayPokemonLineupKey(lineup: OrderedLineup): string {
  return [lineup.lead, lineup.switch, lineup.closer].join(LINEUP_KEY_DELIMITER);
}

/** Enumerates every legal ordered pick-3 lineup for a PlayPokemon bring-6 roster. */
export function enumeratePlayPokemonLineups(roster: string[]): OrderedLineup[] {
  validatePlayPokemonRoster(roster);

  return roster.flatMap((lead) => {
    const backline = roster
      .filter((speciesId) => speciesId !== lead)
      .toSorted();
    const lineups: OrderedLineup[] = [];

    for (
      let switchIndex = 0;
      switchIndex < backline.length - 1;
      switchIndex++
    ) {
      for (
        let closerIndex = switchIndex + 1;
        closerIndex < backline.length;
        closerIndex++
      ) {
        lineups.push({
          lead,
          switch: backline[switchIndex],
          closer: backline[closerIndex],
        });
      }
    }

    return lineups;
  });
}

function validatePlayPokemonRoster(roster: string[]): void {
  if (roster.length !== PLAY_POKEMON_ROSTER_SIZE) {
    throw new PlayPokemonRosterValidationError(
      `PlayPokemon lineup enumeration requires exactly ${PLAY_POKEMON_ROSTER_SIZE} Pokemon.`,
    );
  }

  if (new Set(roster).size !== roster.length) {
    throw new PlayPokemonRosterValidationError(
      'PlayPokemon lineup enumeration requires six unique Pokemon.',
    );
  }

  if (
    roster.some(
      (speciesId) =>
        speciesId.length === 0 || speciesId.includes(LINEUP_KEY_DELIMITER),
    )
  ) {
    throw new PlayPokemonRosterValidationError(
      'PlayPokemon lineup enumeration requires non-empty species identifiers without key delimiters.',
    );
  }
}

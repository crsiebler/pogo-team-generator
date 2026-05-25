'use client';

import { useEffect, useState } from 'react';
import { PokemonCard } from '@/components/molecules';
import { ExportButton } from '@/components/molecules/ExportButton/ExportButton';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type { TeamMovesets } from '@/lib/export';
import type {
  BenchUtility,
  LineupResourcePathMetrics,
  PlayPokemonRosterMetrics,
  Pokemon,
  RecommendedLineup,
  TournamentMode,
} from '@/lib/types';

interface TeamDisplayProps {
  team: string[];
  mode: TournamentMode;
  formatId: BattleFormatId;
  battleFrontierMasterPointsByPokemonName?: Record<string, number>;
  recommendedLineups?: RecommendedLineup[];
  rosterMetrics?: PlayPokemonRosterMetrics;
  benchUtility?: BenchUtility[];
}

const resourcePathLabels: Record<keyof LineupResourcePathMetrics, string> = {
  balanced: 'Balanced',
  shieldSpend: 'Shield spend',
  shieldSave: 'Shield save',
};

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function TeamDisplay({
  team,
  mode,
  formatId,
  battleFrontierMasterPointsByPokemonName = {},
  recommendedLineups = [],
  rosterMetrics,
  benchUtility,
}: TeamDisplayProps) {
  const [pokemonData, setPokemonData] = useState<Pokemon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch full Pokémon data for the team
    fetch('/api/team-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team, formatId }),
    })
      .then((res) => res.json())
      .then((data) => {
        setPokemonData(data.pokemon);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch team details:', err);
        setLoading(false);
      });
  }, [formatId, team]);

  if (loading) {
    return (
      <div className="text-center text-sm text-gray-500 sm:text-base dark:text-gray-400">
        Loading team data...
      </div>
    );
  }

  // Build movesets from pokemon data
  const movesets: TeamMovesets = {};
  pokemonData.forEach((pokemon) => {
    if (pokemon.recommendedMoveset) {
      movesets[pokemon.speciesId] = {
        fastMove: pokemon.recommendedMoveset.fastMove,
        chargedMove1: pokemon.recommendedMoveset.chargedMove1,
        chargedMove2: pokemon.recommendedMoveset.chargedMove2,
      };
    }
  });

  const battleFrontierMasterTeamPoints = pokemonData.reduce(
    (totalPoints, pokemon) => {
      return (
        totalPoints +
        (battleFrontierMasterPointsByPokemonName[pokemon.speciesName] ?? 0)
      );
    },
    0,
  );

  const speciesNameById = new Map(
    pokemonData.map((pokemon) => [pokemon.speciesId, pokemon.speciesName]),
  );

  const getDisplayName = (speciesId: string): string => {
    return speciesNameById.get(speciesId) ?? speciesId;
  };

  const hasRecommendedLineups = recommendedLineups.length > 0;
  const displayedBenchUtility =
    benchUtility ?? rosterMetrics?.benchUtilitySummary;
  const hasRosterMetrics =
    mode === 'PlayPokemon' && rosterMetrics !== undefined;

  return (
    <div className="space-y-3 sm:space-y-4">
      {pokemonData.map((pokemon, index) => (
        <PokemonCard key={index} pokemon={pokemon} />
      ))}

      {hasRecommendedLineups ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <h3 className="text-base font-bold text-emerald-950 sm:text-lg dark:text-emerald-100">
            {mode === 'GBL' ? 'Recommended Lineup' : 'Recommended Lineups'}
          </h3>
          <div className="mt-3 space-y-3">
            {recommendedLineups.map((recommendedLineup, index) => (
              <article
                key={`${recommendedLineup.lineup.lead}-${recommendedLineup.lineup.switch}-${recommendedLineup.lineup.closer}-${index}`}
                className="rounded-lg border border-emerald-100 bg-white p-3 text-xs text-emerald-950 shadow-sm sm:text-sm dark:border-emerald-900 dark:bg-gray-900 dark:text-emerald-50"
              >
                {mode === 'PlayPokemon' ? (
                  <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">
                    Lineup {index + 1}
                  </h4>
                ) : null}
                <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold">Lead</dt>
                    <dd>
                      Lead: {getDisplayName(recommendedLineup.lineup.lead)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Safe Swap</dt>
                    <dd>
                      Safe Swap:{' '}
                      {getDisplayName(recommendedLineup.lineup.switch)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Closer</dt>
                    <dd>
                      Closer: {getDisplayName(recommendedLineup.lineup.closer)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 grid gap-1 text-emerald-900 sm:grid-cols-2 dark:text-emerald-100">
                  <p>Score: {formatScore(recommendedLineup.score)}</p>
                  <p>Structure: {recommendedLineup.diagnosticLabel}</p>
                  <p>
                    Covered threats:{' '}
                    {recommendedLineup.coveredThreats.length > 0
                      ? recommendedLineup.coveredThreats.join(', ')
                      : 'None'}
                  </p>
                  <p>
                    Weaknesses:{' '}
                    {recommendedLineup.weaknesses.length > 0
                      ? recommendedLineup.weaknesses.join(', ')
                      : 'None'}
                  </p>
                </div>
                {recommendedLineup.resourcePathMetrics ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-emerald-800 dark:text-emerald-200">
                    {Object.entries(recommendedLineup.resourcePathMetrics).map(
                      ([pathName, metric]) =>
                        metric.available ? (
                          <span
                            key={pathName}
                            className="rounded-full bg-emerald-100 px-2 py-1 dark:bg-emerald-900"
                          >
                            {
                              resourcePathLabels[
                                pathName as keyof LineupResourcePathMetrics
                              ]
                            }
                            : {formatScore(metric.score)}
                          </span>
                        ) : null,
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {hasRosterMetrics ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 sm:p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
          <h3 className="text-base font-bold text-indigo-950 sm:text-lg dark:text-indigo-100">
            Roster Metrics
          </h3>
          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 sm:text-sm">
            {[
              {
                label: 'Viable Lineups',
                value: String(rosterMetrics.viableLineupCount),
              },
              {
                label: 'Top Lineup Quality',
                value: formatScore(rosterMetrics.topLineupQuality),
              },
              {
                label: 'Top-N Lineup Depth',
                value: formatScore(rosterMetrics.topNLineupDepth),
              },
              {
                label: 'Dominating Matchup Rate',
                value: formatRate(rosterMetrics.dominatingMatchupRate),
              },
              {
                label: 'Overwhelming Loss Rate',
                value: formatRate(rosterMetrics.overwhelmingLossRate),
              },
              {
                label: 'Single-Answer Risks',
                value:
                  rosterMetrics.singleAnswerRisks.length > 0
                    ? rosterMetrics.singleAnswerRisks.join(', ')
                    : 'None',
              },
              {
                label: 'Viable Lead Diversity',
                value: String(rosterMetrics.viableLeadDiversity),
              },
              {
                label: 'Bench Utility Summary',
                value: `${rosterMetrics.benchUtilitySummary.length} roster members tracked`,
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className="rounded-lg border border-indigo-100 bg-white p-3 text-indigo-950 dark:border-indigo-900 dark:bg-gray-900 dark:text-indigo-50"
              >
                <p className="text-xs font-semibold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
                  {metric.label}
                </p>
                <p className="mt-1 font-bold">{metric.value}</p>
              </article>
            ))}
          </div>

          {displayedBenchUtility && displayedBenchUtility.length > 0 ? (
            <div className="mt-4">
              <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                Bench Utility
              </h4>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
                {displayedBenchUtility.map((utility) => (
                  <article
                    key={utility.speciesId}
                    className="rounded-lg border border-indigo-100 bg-white p-3 text-indigo-950 dark:border-indigo-900 dark:bg-gray-900 dark:text-indigo-50"
                  >
                    <p className="font-bold">
                      {getDisplayName(utility.speciesId)}
                    </p>
                    <p className="mt-1">
                      Utility Score: {formatScore(utility.utilityScore)}
                    </p>
                    <p>Appearances: {utility.totalAppearances} total</p>
                    <p>
                      Lead: {utility.leadAppearances} / Safe Swap:{' '}
                      {utility.switchAppearances} / Closer:{' '}
                      {utility.closerAppearances}
                    </p>
                    {utility.warnings.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {utility.warnings.map((warning) => (
                          <span
                            key={warning}
                            className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100"
                          >
                            Warning: {warning}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:mt-6 sm:p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-bold text-blue-900 dark:text-blue-100">
            💡 Team Notes
          </h4>
          <ExportButton team={team} movesets={movesets} />
        </div>
        <ul className="space-y-1 text-xs text-blue-800 sm:text-sm dark:text-blue-200">
          <li>
            • This team is optimized for{' '}
            {mode === 'GBL' ? 'GO Battle League' : 'Play! Pokémon'} format
          </li>
          {formatId === 'battle-frontier-master' ? (
            <li>
              • Current Battle Frontier Master point usage:{' '}
              {battleFrontierMasterTeamPoints} / 11 points
            </li>
          ) : null}
          <li>• Check type coverage and adjust movesets as needed</li>
        </ul>
      </div>
    </div>
  );
}

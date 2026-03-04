import { describe, expect, it } from 'vitest';
import { selectSimulationTargetSpeciesIds } from './simulations';

function toRankingsCsv(pokemonNames: string[]): string {
  const rows = pokemonNames.map((name) => `${name},100`);
  return ['Pokemon,Score', ...rows].join('\n');
}

function toSpeciesId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

describe('selectSimulationTargetSpeciesIds', () => {
  it('includes role-specific targets outside overall top 200', () => {
    const overallNames = Array.from(
      { length: 200 },
      (_, i) => `Overall ${i + 1}`,
    );
    const roleOnlyLead = 'Role Lead Specialist';
    const leadNames = [roleOnlyLead];

    const allNames = [...overallNames, ...leadNames];
    const pokemonData = allNames.map((name) => ({
      speciesId: toSpeciesId(name),
      speciesName: name,
      released: true,
    }));

    const result = selectSimulationTargetSpeciesIds({
      overallCsvText: toRankingsCsv(overallNames),
      leadsCsvText: toRankingsCsv(leadNames),
      switchesCsvText: toRankingsCsv([]),
      closersCsvText: toRankingsCsv([]),
      pokemonData,
    });

    expect(result.speciesIds).toContain(toSpeciesId(roleOnlyLead));
  });

  it('deduplicates targets after canonical form normalization', () => {
    const pokemonData = [
      {
        speciesId: 'morpeko_hangry',
        speciesName: 'Morpeko (Hangry)',
        released: true,
      },
      {
        speciesId: 'morpeko_full_belly',
        speciesName: 'Morpeko (Full Belly)',
        released: true,
      },
    ];

    const result = selectSimulationTargetSpeciesIds({
      overallCsvText: toRankingsCsv(['Morpeko (Hangry)']),
      leadsCsvText: toRankingsCsv(['Morpeko (Full Belly)']),
      switchesCsvText: toRankingsCsv([]),
      closersCsvText: toRankingsCsv([]),
      pokemonData,
    });

    expect(result.speciesIds).toEqual(['morpeko_full_belly']);
    expect(result.counts.speciesUnion).toBe(1);
  });

  it('applies per-role limits before building the union', () => {
    const overallNames = Array.from(
      { length: 250 },
      (_, i) => `Overall ${i + 1}`,
    );
    const leadNames = Array.from({ length: 120 }, (_, i) => `Lead ${i + 1}`);
    const switchNames = Array.from(
      { length: 120 },
      (_, i) => `Switch ${i + 1}`,
    );
    const closerNames = Array.from(
      { length: 120 },
      (_, i) => `Closer ${i + 1}`,
    );

    const allNames = [
      ...overallNames,
      ...leadNames,
      ...switchNames,
      ...closerNames,
    ];
    const pokemonData = allNames.map((name) => ({
      speciesId: toSpeciesId(name),
      speciesName: name,
      released: true,
    }));

    const result = selectSimulationTargetSpeciesIds({
      overallCsvText: toRankingsCsv(overallNames),
      leadsCsvText: toRankingsCsv(leadNames),
      switchesCsvText: toRankingsCsv(switchNames),
      closersCsvText: toRankingsCsv(closerNames),
      pokemonData,
    });

    expect(result.counts.overall).toBe(200);
    expect(result.counts.leads).toBe(100);
    expect(result.counts.switches).toBe(100);
    expect(result.counts.closers).toBe(100);

    expect(result.speciesIds).not.toContain(toSpeciesId('Overall 250'));
    expect(result.speciesIds).not.toContain(toSpeciesId('Lead 120'));
    expect(result.speciesIds).not.toContain(toSpeciesId('Switch 120'));
    expect(result.speciesIds).not.toContain(toSpeciesId('Closer 120'));
  });
});

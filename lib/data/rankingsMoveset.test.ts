import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { getOptimalMoveset } from './rankings';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const mockReadFileSync = vi.fn();
  return {
    ...actual,
    default: { ...actual, readFileSync: mockReadFileSync },
    readFileSync: mockReadFileSync,
  };
});

describe('ranking moveset alias loading', () => {
  it('normalizes CSV spelling aliases independently of seasonal recommendations', () => {
    vi.mocked(readFileSync).mockReturnValue(
      [
        'Pokemon,Fast Move,Charged Move 1,Charged Move 2',
        'Snorlax,Lick,Body Slam,Superpower',
        'Krabby,Bubble,Vise Grip,Razor Shell',
      ].join('\n'),
    );

    expect(getOptimalMoveset('Snorlax')).toEqual({
      fastMove: 'LICK',
      chargedMove1: 'BODY_SLAM',
      chargedMove2: 'SUPER_POWER',
    });
    expect(getOptimalMoveset('Krabby')).toEqual({
      fastMove: 'BUBBLE',
      chargedMove1: 'VICE_GRIP',
      chargedMove2: 'RAZOR_SHELL',
    });
    expect(readFileSync).toHaveBeenCalledWith(
      `${process.cwd()}/data/rankings/cp1500/all/overall_rankings.csv`,
      'utf-8',
    );
  });
});

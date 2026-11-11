import { describe, expect, it } from 'vitest';
import { getSyncBattleFormats } from './battleFormats';
import { getBattleFormats } from '@/lib/data/battleFormats';

describe('scoped sync formats', () => {
  it('preserves the full catalog for an unscoped sync', () => {
    expect(getSyncBattleFormats()).toEqual(getBattleFormats());
  });

  it('selects only LAIC GBL for a scoped sync', () => {
    expect(getSyncBattleFormats(['laic-2027-gbl-cup'])).toEqual([
      expect.objectContaining({
        id: 'laic-2027-gbl-cup',
        cup: 'laic2027gbl',
        cp: 1500,
      }),
    ]);
  });

  it('rejects empty and unknown selections instead of syncing other formats', () => {
    expect(() => getSyncBattleFormats([])).toThrow('at least one');
    expect(() => getSyncBattleFormats(['unknown' as never])).toThrow('Unknown');
  });
});

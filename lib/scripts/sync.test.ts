import { describe, expect, it, vi } from 'vitest';
import { parseSyncArguments, runSyncCommand } from './syncCommand';

describe('sync command', () => {
  it.each([
    {
      args: [],
      expected: {
        resume: false,
        includeMovesetVariants: false,
        projectSimulations: false,
      },
    },
    {
      args: ['--resume'],
      expected: {
        resume: true,
        includeMovesetVariants: false,
        projectSimulations: false,
      },
    },
    {
      args: ['--moveset-variants'],
      expected: {
        resume: false,
        includeMovesetVariants: true,
        projectSimulations: false,
      },
    },
    {
      args: ['--moveset-variants', '--resume'],
      expected: {
        resume: true,
        includeMovesetVariants: true,
        projectSimulations: false,
      },
    },
  ])('parses $args', ({ args, expected }) => {
    expect(parseSyncArguments(args)).toEqual(expected);
  });

  it('rejects unknown arguments with the supported options', () => {
    expect(() => parseSyncArguments(['--resuem'])).toThrow(
      "Unknown sync option '--resuem'. Supported options: --resume, --moveset-variants, --project-simulations",
    );
  });

  it('rejects resume mode for read-only projection', () => {
    expect(() =>
      parseSyncArguments(['--project-simulations', '--resume']),
    ).toThrow(
      '--project-simulations is read-only and cannot be combined with --resume',
    );
  });

  it.each([
    {
      args: [] as string[],
      expected: { resume: false, includeMovesetVariants: false },
    },
    {
      args: ['--resume'],
      expected: { resume: true, includeMovesetVariants: false },
    },
    {
      args: ['--moveset-variants'],
      expected: { resume: false, includeMovesetVariants: true },
    },
    {
      args: ['--resume', '--moveset-variants'],
      expected: { resume: true, includeMovesetVariants: true },
    },
  ])('passes $args to normal sync', async ({ args, expected }) => {
    const runSync = vi.fn().mockResolvedValue(undefined);
    const projectSimulations = vi.fn();

    await runSyncCommand(args, {
      runSync,
      projectSimulations,
      writeOutput: vi.fn(),
      log: vi.fn(),
    });

    expect(runSync).toHaveBeenCalledWith(expected);
    expect(projectSimulations).not.toHaveBeenCalled();
  });

  it.each([
    { args: ['--project-simulations'], includeMovesetVariants: false },
    {
      args: ['--project-simulations', '--moveset-variants'],
      includeMovesetVariants: true,
    },
  ])(
    'keeps projection read-only for $args',
    async ({ args, includeMovesetVariants }) => {
      const runSync = vi.fn();
      const projection = {
        includesMovesetVariants: includeMovesetVariants,
        formats: [],
        totals: {
          candidateSpecies: 0,
          candidateVariants: 0,
          alternateVariants: 0,
          shieldScenarioCsvs: 0,
          staleVariantFiles: 0,
        },
      };
      const projectSimulations = vi.fn().mockResolvedValue(projection);
      const writeOutput = vi.fn();

      await runSyncCommand(args, {
        runSync,
        projectSimulations,
        writeOutput,
        log: vi.fn(),
      });

      expect(runSync).not.toHaveBeenCalled();
      expect(projectSimulations).toHaveBeenCalledWith({
        includeMovesetVariants,
      });
      expect(writeOutput).toHaveBeenCalledWith(
        `${JSON.stringify(projection, null, 2)}\n`,
      );
    },
  );
});

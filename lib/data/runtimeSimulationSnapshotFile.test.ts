import { constants } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeSimulationSnapshotFileReader } from './runtimeSimulationSnapshotFile';

describe('runtime simulation snapshot file reader', () => {
  it('opens without following symlinks and returns an unchanged regular file', () => {
    const close = vi.fn();
    const open = vi.fn(() => 7);
    const read = vi
      .fn<
        (
          descriptor: number,
          buffer: Buffer,
          offset: number,
          length: number,
          position: null,
        ) => number
      >()
      .mockImplementationOnce((_descriptor, buffer, offset) => {
        buffer.write('data', offset);
        return 4;
      })
      .mockReturnValueOnce(0);
    const readText = createRuntimeSimulationSnapshotFileReader({
      close,
      fstat: () => ({ isFile: () => true, size: 4 }),
      open,
      read,
    });

    expect(readText('/repository/runtime-snapshot.json', 10)).toBe('data');
    expect(open).toHaveBeenCalledWith(
      '/repository/runtime-snapshot.json',
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    expect(close).toHaveBeenCalledWith(7);
  });

  it('rejects files that grow after the bounded stat check', () => {
    const readText = createRuntimeSimulationSnapshotFileReader({
      close: vi.fn(),
      fstat: () => ({ isFile: () => true, size: 4 }),
      open: () => 7,
      read: (_descriptor: number, buffer: Buffer, offset: number): number => {
        buffer.write('extra', offset);
        return 5;
      },
    });

    expect(() => readText('/repository/runtime-snapshot.json', 10)).toThrow(
      /changed while being read/i,
    );
  });

  it('rejects non-regular and oversized files before allocating the read', () => {
    const read = vi.fn();
    const readText = createRuntimeSimulationSnapshotFileReader({
      close: vi.fn(),
      fstat: () => ({ isFile: () => false, size: 11 }),
      open: () => 7,
      read,
    });

    expect(() => readText('/repository/runtime-snapshot.json', 10)).toThrow(
      /regular file no larger than 10 bytes/i,
    );
    expect(read).not.toHaveBeenCalled();
  });
});

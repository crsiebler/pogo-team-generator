import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

interface RuntimeSimulationSnapshotFileReaderDependencies {
  readonly open: (filePath: string, flags: number) => number;
  readonly fstat: (descriptor: number) => Readonly<{
    isFile: () => boolean;
    size: number;
  }>;
  readonly read: (
    descriptor: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: null,
  ) => number;
  readonly close: (descriptor: number) => void;
}

/** Create a bounded regular-file reader that refuses final-component symlinks. */
export function createRuntimeSimulationSnapshotFileReader(
  dependencies: RuntimeSimulationSnapshotFileReaderDependencies,
): (filePath: string, maxBytes: number) => string {
  return (filePath: string, maxBytes: number): string => {
    const descriptor = dependencies.open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stats = dependencies.fstat(descriptor);
      if (
        !stats.isFile() ||
        !Number.isSafeInteger(stats.size) ||
        stats.size < 0 ||
        stats.size > maxBytes
      ) {
        throw new Error(
          `Runtime simulation snapshot must be a regular file no larger than ${maxBytes} bytes.`,
        );
      }
      const bytes = Buffer.allocUnsafe(stats.size + 1);
      let bytesRead = 0;
      while (bytesRead < bytes.length) {
        const count = dependencies.read(
          descriptor,
          bytes,
          bytesRead,
          bytes.length - bytesRead,
          null,
        );
        if (count === 0) {
          break;
        }
        bytesRead += count;
      }
      if (bytesRead !== stats.size) {
        throw new Error(
          'Runtime simulation snapshot changed while being read.',
        );
      }
      return bytes.subarray(0, bytesRead).toString('utf8');
    } finally {
      dependencies.close(descriptor);
    }
  };
}

/** Read one runtime snapshot through the production filesystem boundary. */
export const readRuntimeSimulationSnapshotFile =
  createRuntimeSimulationSnapshotFileReader({
    open: openSync,
    fstat: fstatSync,
    read: readSync,
    close: closeSync,
  });

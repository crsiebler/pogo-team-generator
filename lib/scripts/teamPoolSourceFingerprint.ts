import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Digest optimizer and runtime-data source files used by pool generation. */
export function getTeamPoolSourceFingerprint(): string {
  const files: string[] = ['lib/types.ts', 'lib/teamDetails.ts'];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (
        entry.isFile() &&
        name.endsWith('.ts') &&
        !name.endsWith('.test.ts') &&
        name !== 'lib/genetic/pregeneratedTeams.ts'
      )
        files.push(name);
    }
  };
  for (const dir of ['lib/data', 'lib/genetic', 'lib/analysis']) visit(dir);
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file).update(readFileSync(file));
  return hash.digest('hex');
}

import { isBattleFormatId } from '@/lib/data/battleFormats';
import { runSync } from '@/lib/sync';

const formatId = process.argv[2];
if (process.argv.length !== 3 || !formatId || !isBattleFormatId(formatId)) {
  throw new Error('Usage: bun run lib/scripts/syncBattleFormat.ts <format-id>');
}
await runSync({ formatIds: [formatId] });

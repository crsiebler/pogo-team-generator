import 'server-only';
import { readFileSync } from 'fs';

interface SyncMetadata {
  lastSuccessfulSyncAt: string;
}

/**
 * Read timestamp of the last successful sync run.
 */
export function getLastSuccessfulSyncAt(): string | null {
  try {
    const filePath = `${process.cwd()}/data/sync-metadata.json`;
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(fileContent) as SyncMetadata;

    if (!parsed.lastSuccessfulSyncAt) {
      return null;
    }

    const date = new Date(parsed.lastSuccessfulSyncAt);
    return Number.isNaN(date.getTime()) ? null : parsed.lastSuccessfulSyncAt;
  } catch {
    return null;
  }
}

/**
 * Format an ISO date string as UTC for UI display.
 */
export function formatUtcDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return `${date.toISOString().replace('T', ' ').replace('Z', '')} UTC`;
}

import { SyncConfig } from './types';

export const syncConfig: SyncConfig = {
  pvpokeBaseUrl: 'http://localhost/pvpoke/src',
  githubBaseUrl:
    'https://raw.githubusercontent.com/pvpoke/pvpoke/refs/heads/master/src/data/gamemaster',
  outputDir: 'data',
  timeout: 30000, // 30 second timeout for browser stability
  retryAttempts: Infinity,
  localMode: true, // Use local PvPoke instance for development
};

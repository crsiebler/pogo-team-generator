import type { NextConfig } from 'next';
import { loadRuntimeFunctionAssetPlan } from './lib/build/runtimeFunctionAssets';

const runtimeFunctionAssets = loadRuntimeFunctionAssetPlan();
const toTraceInclude = (asset: string): string => `./${asset}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/generate-team':
      runtimeFunctionAssets.generateTeam.map(toTraceInclude),
    '/api/team-details': runtimeFunctionAssets.teamDetails.map(toTraceInclude),
    '/api/pokemon-list': runtimeFunctionAssets.pokemonList.map(toTraceInclude),
  },
  outputFileTracingExcludes: {
    '/api/generate-team':
      runtimeFunctionAssets.generateTeamExcludes.map(toTraceInclude),
    '/api/team-details':
      runtimeFunctionAssets.teamDetailsExcludes.map(toTraceInclude),
    '/api/pokemon-list':
      runtimeFunctionAssets.pokemonListExcludes.map(toTraceInclude),
  },
};

export default nextConfig;

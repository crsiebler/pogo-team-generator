import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/generate-team': ['./data/**/*.csv', './data/**/*.json'],
    '/api/pokemon-list': ['./data/**/*.csv', './data/**/*.json'],
  },
};

export default nextConfig;

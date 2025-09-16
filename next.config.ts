// next.config.mjs

import webpack from 'webpack';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // FIX #1: This tells Next.js to compile the Saros SDK from TypeScript.
  transpilePackages: ['@saros-finance/dlmm-sdk'],

  eslint: {
    ignoreDuringBuilds: true,
  },

  // FIX #2: This keeps the Buffer polyfill that the Solana SDK needs.
  webpack: (config: { plugins: webpack.ProvidePlugin[]; resolve: { fallback: any; }; }) => {
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      })
    );
    
    config.resolve.fallback = {
      ...config.resolve.fallback,
      buffer: require.resolve('buffer/')
    };

    return config;
  },
};

export default nextConfig;
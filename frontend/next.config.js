/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Silence "indexedDB is not defined" warning from wagmi storage on SSR.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};
module.exports = nextConfig;

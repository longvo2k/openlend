/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Silence "indexedDB is not defined" warning from wagmi storage on SSR.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    // MetaMask SDK references @react-native-async-storage/async-storage for
    // RN environments. Web builds don't have it — alias to false so webpack
    // treats it as an empty module instead of failing the build.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };

    return config;
  },
};
module.exports = nextConfig;

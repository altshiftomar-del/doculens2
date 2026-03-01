/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Web Workers from public directory
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
  // Required for OpenCV.js WASM
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

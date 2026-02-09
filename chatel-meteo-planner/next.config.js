/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NODE_ENV === 'production' ? '/chatel-meteo-planner' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/chatel-meteo-planner' : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.NODE_ENV === 'production' ? '/chatel-meteo-planner' : ''
  },
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;

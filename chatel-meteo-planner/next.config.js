/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/chatel-apps-repository',
  assetPrefix: '/chatel-apps-repository',
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;

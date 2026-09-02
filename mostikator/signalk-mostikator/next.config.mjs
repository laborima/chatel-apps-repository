/**
 * Two static build targets share the same code:
 *   - signalk : served by the SignalK server under /signalk-mostikator (default)
 *   - esp     : served by the ESP32-P4 itself from LittleFS at /
 *
 *   npm run build:signalk   -> out/
 *   npm run build:esp       -> out-esp/
 */
const target = process.env.NEXT_PUBLIC_TARGET || "signalk";
const isProd = process.env.NODE_ENV === "production";
const basePath = isProd && target === "signalk" ? "/signalk-mostikator" : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  distDir: target === "esp" ? ".next-esp" : ".next",
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  // Source maps double the size on the ESP flash
  productionBrowserSourceMaps: false
};

export default nextConfig;

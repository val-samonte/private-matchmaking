import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    
    // Allow JSON imports
    config.module.rules.push({
      test: /\.json$/,
      type: "json",
    });
    
    return config;
  },
};

export default nextConfig;





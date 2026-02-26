import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Point @sdk at the workspace SDK source
    config.resolve.alias = {
      ...config.resolve.alias,
      "@sdk": path.resolve(__dirname, "../sdk/src"),
    };
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





import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local single-user tool; no telemetry-relevant features needed.
  devIndicators: false,
  // Pin the Turbopack workspace root to this server directory. The skill ships
  // a sibling scripts/package.json (for the mermaid checker), which otherwise
  // makes Next infer scripts/ as the root and fail to resolve `next`.
  turbopack: { root: __dirname },
};

export default nextConfig;

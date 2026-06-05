import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local single-user tool; no telemetry-relevant features needed.
  devIndicators: false,
};

export default nextConfig;

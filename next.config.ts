import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // instrumentation.ts is auto-loaded in Next.js 15+ without any config flag.
  // The instrumentationHook flag was only needed in Next.js 13/14.
};

export default nextConfig;

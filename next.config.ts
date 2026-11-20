import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  devIndicators: false, // désactive le bandeau "Next.js" en bas à droite de l'application
  //cacheComponents: false,
  //partialPrefetching: true,
};

export default nextConfig;

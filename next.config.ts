import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // O PDF do extrato sobe por uma server action; o padrão de 1MB não cabe
    // num extrato de alguns meses. A Vercel aceita até 4,5MB por requisição.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;

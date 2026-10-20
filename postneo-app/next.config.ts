import type { NextConfig } from "next";

/** Серверная сборка для карточек пациентов: standalone для Docker, basePath из окружения (пусто в больнице, /kart на демо). */
const basePath = process.env.BASE_PATH || "";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  basePath,
  serverExternalPackages: ["better-sqlite3"],
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;

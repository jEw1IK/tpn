import type { NextConfig } from "next";

/** Серверная сборка для карточек пациентов: standalone для Docker, basePath из окружения (пусто в больнице, /kart на демо). */
const basePath = process.env.BASE_PATH || "";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_HEARTBEAT: "1" },
};

export default nextConfig;

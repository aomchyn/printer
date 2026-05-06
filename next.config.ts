// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname, // ชี้ไปที่ root ของโปรเจคนี้
  },
};

export default nextConfig;
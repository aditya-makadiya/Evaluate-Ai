import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Expose Supabase config to the browser if NEXT_PUBLIC_ vars are not set
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  },
};

export default nextConfig;

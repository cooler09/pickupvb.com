/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ['@pickupvb/domain', '@pickupvb/types', '@pickupvb/supabase'],
    experimental: {
        typedRoutes: true,
    },
};

export default nextConfig;

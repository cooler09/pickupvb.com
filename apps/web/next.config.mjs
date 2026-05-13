/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: [
        '@pickupvb/application',
        '@pickupvb/domain',
        '@pickupvb/infrastructure',
        '@pickupvb/supabase',
        '@pickupvb/types',
    ],
    experimental: {
        typedRoutes: true,
    },
    webpack(config) {
        // Resolve `.js` / `.mjs` / `.cjs` import specifiers to TS sources
        // inside our ESM workspace packages (NodeNext-style imports).
        config.resolve.extensionAlias = {
            ...(config.resolve.extensionAlias ?? {}),
            '.js': ['.ts', '.tsx', '.js'],
            '.mjs': ['.mts', '.mjs'],
            '.cjs': ['.cts', '.cjs'],
        };
        return config;
    },
};

export default nextConfig;

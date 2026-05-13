import preset from '@pickupvb/config/tailwind';

/** @type {import('tailwindcss').Config} */
export default {
    presets: [preset],
    content: [
        './src/**/*.{ts,tsx,mdx}',
        './node_modules/@pickupvb/ui/dist/**/*.{js,mjs}',
    ],
};

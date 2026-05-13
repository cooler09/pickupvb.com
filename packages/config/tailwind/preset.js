/** @type {import('tailwindcss').Config} */
const preset = {
    content: [],
    theme: {
        extend: {
            colors: {
                court: {
                    50: '#fff7ed',
                    100: '#ffedd5',
                    500: '#f97316', // volleyball orange
                    600: '#ea580c',
                    700: '#c2410c',
                },
                sand: {
                    50: '#fefce8',
                    100: '#fef9c3',
                    500: '#eab308',
                },
                net: {
                    900: '#0f172a',
                    800: '#1e293b',
                },
            },
            fontFamily: {
                sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
        },
    },
    plugins: [],
};

export default preset;

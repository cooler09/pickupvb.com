/** @type {import('tailwindcss').Config} */
const preset = {
    content: [],
    darkMode: ['class', '[data-theme="dark"]'],
    theme: {
        extend: {
            colors: {
                // Theme tokens (driven by CSS variables, switched per data-theme).
                background: 'rgb(var(--color-background) / <alpha-value>)',
                surface: 'rgb(var(--color-surface) / <alpha-value>)',
                primary: {
                    DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
                    fg: 'rgb(var(--color-primary-fg) / <alpha-value>)',
                },
                secondary: {
                    DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
                    fg: 'rgb(var(--color-secondary-fg) / <alpha-value>)',
                },
                highlight: {
                    DEFAULT: 'rgb(var(--color-highlight) / <alpha-value>)',
                    fg: 'rgb(var(--color-highlight-fg) / <alpha-value>)',
                },
                fg: 'rgb(var(--color-fg) / <alpha-value>)',
                muted: 'rgb(var(--color-muted) / <alpha-value>)',
                'border-base': 'rgb(var(--color-border) / <alpha-value>)',

                // Legacy palette (kept so existing utility classes keep working).
                court: {
                    50: '#fff7ed',
                    100: '#ffedd5',
                    200: '#fed7aa',
                    300: '#fdba74',
                    500: '#f97316',
                    600: '#ea580c',
                    700: '#c2410c',
                    800: '#9a3412',
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

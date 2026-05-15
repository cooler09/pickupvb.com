// Ambient declarations for side-effect CSS imports (TS 6 no longer infers
// these for non-JS extensions). Next.js handles the actual loading via webpack.
declare module '*.css';

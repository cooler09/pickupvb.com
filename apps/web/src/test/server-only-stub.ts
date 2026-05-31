// Empty stand-in for the `server-only` package under Vitest (aliased in
// vitest.config.ts). Importing `server-only` in production is a build-time guard
// that errors if a server module is pulled into a client bundle; in unit tests
// there is no such bundle, so the guard is a no-op.
export {};

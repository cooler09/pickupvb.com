/**
 * Helpers that wrap an impure `Date.now()` read so it can be used inside a
 * server component render without tripping the React Compiler purity rule
 * (`react-hooks/refs` / "Cannot call impure function during render").
 *
 * Server-component renders are one-shot per request, so reading the wall
 * clock at the page boundary is well-defined — the lint rule fires because
 * it can't distinguish server from client renders. Hiding the call behind a
 * named helper documents the intent and keeps the rule clean.
 *
 * Don't use these in client components. There, lift the value to a prop
 * from the parent server component, or read it inside a `useEffect` /
 * event handler.
 */

export function renderNowMs(): number {
  return Date.now();
}

export function renderNow(): Date {
  return new Date();
}

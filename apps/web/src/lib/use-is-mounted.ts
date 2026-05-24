'use client';

import { useSyncExternalStore } from 'react';

/** Stable no-op subscribe — the mounted flag flips once at hydration and
 *  never changes again, so there's nothing to subscribe to. */
function subscribe(): () => void {
  return () => {};
}

const getSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

/**
 * Returns `false` during SSR and the first render on the client, `true` on
 * every render after hydration. Use this in place of the
 * `const [mounted, setMounted] = useState(false); useEffect(...)` pattern,
 * which trips the `react-hooks/set-state-in-effect` lint rule under React 19
 * + the React Compiler.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

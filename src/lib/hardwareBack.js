// Hardware back-button interceptor stack.
//
// Capacitor's Android hardware back button is a single global event — it
// has no concept of "the wizard on screen wants first refusal." Without
// this, a hardware back-press while mid-flow (e.g. the gem-drop wizard)
// falls straight through to router history and jumps out of the whole
// screen instead of stepping back one step, silently discarding progress.
//
// Screens register a handler here while mounted. On each back-press, the
// most-recently-registered (innermost/active) handler gets first refusal:
// returning true means "I handled it, stop here." Returning false lets the
// press fall through to the next handler, and eventually to the app-level
// default (router back / exit) if nothing claims it.

const interceptors = [];

export function registerBackInterceptor(handler) {
  interceptors.push(handler);
  return () => {
    const idx = interceptors.indexOf(handler);
    if (idx !== -1) interceptors.splice(idx, 1);
  };
}

export function runBackInterceptors() {
  for (let i = interceptors.length - 1; i >= 0; i--) {
    if (interceptors[i]()) return true;
  }
  return false;
}

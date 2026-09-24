/**
 * Catches JS errors/rejections that happen outside the React render tree
 * (event handlers, timers, unawaited promises) — ErrorBoundary only sees
 * errors thrown during render. Reports to the same Error Console backend as
 * ErrorBoundary. Call once from the app's entry point.
 */
import { errorConsoleService } from '@/services/errorConsoleService';

let installed = false;

function report(message: string, stack?: string) {
  // Ignore harmless browser layout warnings that spam the error console
  if (message.includes('ResizeObserver loop')) {
    return;
  }

  errorConsoleService
    .reportClientError({ message, stack, route: window.location.pathname })
    .catch(() => {});
}

export function installErrorReporting() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    report(event.message || 'Unknown window error', event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    report(message, stack);
  });
}

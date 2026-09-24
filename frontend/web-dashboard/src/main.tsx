import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import 'leaflet/dist/leaflet.css';
import '@/index.css';
import AppRouter from '@/router';
import { installErrorReporting } from '@/lib/errorReporting';

installErrorReporting();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reuse fresh data for 30 seconds to prevent immediate refetching on every route change
      staleTime: 30000,
      refetchOnMount: false,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Auto-reload window on Vite module preload failure (cooldown protected)
window.addEventListener('vite:preloadError', () => {
  const STORAGE_KEY = 'retry-lazy-last-reload';
  const lastReloadStr = window.sessionStorage.getItem(STORAGE_KEY);
  const now = Date.now();
  if (!lastReloadStr || now - parseInt(lastReloadStr, 10) > 15000) {
    window.sessionStorage.setItem(STORAGE_KEY, now.toString());
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Toaster richColors position="bottom-right" />
      <AppRouter />
    </QueryClientProvider>
  </StrictMode>
);

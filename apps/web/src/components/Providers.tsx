'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { ServiceWorker } from './ServiceWorker';
import { ToastProvider } from './Toasts';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Don't hammer the API on auth/validation errors; retry once when offline or 5xx.
            retry: (count, e) => count < 1 && (!(e instanceof ApiError) || e.retryable),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
      <ServiceWorker />
    </QueryClientProvider>
  );
}

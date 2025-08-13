import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

// Silence all console output in production
if (import.meta.env.PROD) {
  const methods: (keyof Console)[] = [
    'log', 'error', 'warn', 'info', 'debug', 'trace',
    'group', 'groupCollapsed', 'groupEnd',
    'time', 'timeEnd', 'timeLog', 'timeStamp',
    'table', 'assert', 'dir', 'dirxml', 'count', 'countReset', 'clear'
  ]
  for (const m of methods) {
    try {
      // @ts-expect-error - overriding console methods intentionally
      console[m] = () => {}
    } catch {
      // no-op
    }
  }
}

// Import test utilities for debugging in development
if (import.meta.env.DEV) {
  import('./utils/testContextLoader');
}

// Create a client with refetchOnWindowFocus disabled
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5-minute staleTime for better performance
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)

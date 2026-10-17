import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ApiError } from './api.ts'
import App from './App.tsx'
import { AuthProvider } from './auth.tsx'
import './index.css'
import { PageError, UiProvider } from './ui.tsx'

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <UiProvider>
          <PageError>
            <AuthProvider>
              <App />
            </AuthProvider>
          </PageError>
        </UiProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api.ts'
import type { Category } from './types.ts'
import { errorMessage, useUi } from './ui.tsx'

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<{ items: Category[] }>('/admin/categories').then((result) => result.items) })

/** Runs a write, toasts the outcome and refreshes the listed query keys. */
export function useAction<TArgs, TResult = unknown>(run: (args: TArgs) => Promise<TResult>, options: { success?: string | ((result: TResult) => string); invalidate?: string[]; onDone?: (result: TResult) => void } = {}) {
  const client = useQueryClient()
  const { toast } = useUi()
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => {
      for (const key of options.invalidate ?? []) void client.invalidateQueries({ queryKey: [key] })
      const message = typeof options.success === 'function' ? options.success(result) : options.success
      if (message) toast(message)
      options.onDone?.(result)
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  })
}

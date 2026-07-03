import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { settingsApi } from '@/api/settings'
import type { UserSettingsRequest } from '@/types'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: UserSettingsRequest) => settingsApi.update(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: settingsApi.testConnection,
    onSuccess: (data) => {
      if (data.ok) {
        toast.success('LLM connection successful')
      } else {
        toast.error('Connection failed', { description: data.error ?? undefined })
      }
    },
    onError: () => toast.error('Connection test request failed'),
  })
}

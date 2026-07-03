import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { scansApi } from '@/api/scans'
import type { CreateScanPayload, FollowupActivePayload, PortConfig } from '@/types'

export function useScanList(page = 1) {
  return useQuery({
    queryKey: ['scans', page],
    queryFn: () => scansApi.list(page),
    refetchInterval: 5000,  // poll while scans may be running
  })
}

export function useScan(id: string | undefined) {
  return useQuery({
    queryKey: ['scan', id],
    queryFn: () => scansApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' || status === 'pending' ? 3000 : false
    },
  })
}

export function useCreateScan() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (payload: CreateScanPayload) => scansApi.create(payload),
    onSuccess: (scan) => {
      qc.invalidateQueries({ queryKey: ['scans'] })
      navigate(`/scans/${scan.id}`)
    },
  })
}

export function useDeleteScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => scansApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scans'] }),
  })
}

export function useTriggerSuggested(scanId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (suggestedId: string) => scansApi.triggerSuggested(scanId, suggestedId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['results', scanId] }),
  })
}

export function useFollowupActive(scanId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FollowupActivePayload) => scansApi.followupActive(scanId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scans'] }),
  })
}

export function useCancelScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => scansApi.cancel(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['scans'] })
      qc.invalidateQueries({ queryKey: ['scan', id] })
    },
  })
}

export function usePauseScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => scansApi.pause(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['scans'] })
      qc.invalidateQueries({ queryKey: ['scan', id] })
    },
  })
}

export function useResumeScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => scansApi.resume(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['scans'] })
      qc.invalidateQueries({ queryKey: ['scan', id] })
    },
  })
}

export function usePatchScan(scanId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { modules?: string[]; port_config?: PortConfig }) =>
      scansApi.patch(scanId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scan', scanId] })
      qc.invalidateQueries({ queryKey: ['scans'] })
    },
  })
}

export function usePentestResults(id: string | undefined) {
  return useQuery({
    queryKey: ['pentest-results', id],
    queryFn: () => scansApi.pentestResults(id!),
    enabled: !!id,
  })
}

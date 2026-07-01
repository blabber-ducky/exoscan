import { api } from './client'
import type { CreateScanPayload, PagedScans, Scan, ScanResults } from '@/types'

export const scansApi = {
  create: (payload: CreateScanPayload) =>
    api.post<Scan>('/scans', payload).then((r) => r.data),

  list: (page = 1, limit = 20) =>
    api.get<PagedScans>('/scans', { params: { page, limit } }).then((r) => r.data),

  get: (id: string) =>
    api.get<Scan>(`/scans/${id}`).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/scans/${id}`),

  results: (id: string) =>
    api.get<ScanResults>(`/scans/${id}/results`).then((r) => r.data),

  triggerSuggested: (scanId: string, suggestedId: string) =>
    api
      .post(`/scans/${scanId}/suggested/${suggestedId}/trigger`)
      .then((r) => r.data),
}

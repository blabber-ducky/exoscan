import { api } from './client'
import type { CreateScanPayload, FollowupActivePayload, FollowupActiveResult, PagedScans, PortConfig, Scan, ScanResults } from '@/types'

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

  followupActive: (scanId: string, payload: FollowupActivePayload) =>
    api
      .post<FollowupActiveResult>(`/scans/${scanId}/followup-active`, payload)
      .then((r) => r.data),

  cancel: (id: string) =>
    api.post<Scan>(`/scans/${id}/cancel`).then((r) => r.data),

  pause: (id: string) =>
    api.post<Scan>(`/scans/${id}/pause`).then((r) => r.data),

  resume: (id: string) =>
    api.post<Scan>(`/scans/${id}/resume`).then((r) => r.data),

  patch: (id: string, payload: { modules?: string[]; port_config?: PortConfig }) =>
    api.patch<Scan>(`/scans/${id}`, payload).then((r) => r.data),
}

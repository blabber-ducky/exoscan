import { api } from './client'
import type { GroupSummary, ScanShare, UserSummary } from '@/types'

export const sharesApi = {
  listShares: (scanId: string) =>
    api.get<ScanShare[]>(`/api/v1/scans/${scanId}/shares`).then((r) => r.data),

  shareWithUser: (scanId: string, userId: string) =>
    api.post<ScanShare>(`/api/v1/scans/${scanId}/shares/users`, { user_id: userId }).then((r) => r.data),

  shareWithGroup: (scanId: string, groupId: string) =>
    api.post<ScanShare>(`/api/v1/scans/${scanId}/shares/groups`, { group_id: groupId }).then((r) => r.data),

  revokeShare: (scanId: string, shareId: string) =>
    api.delete(`/api/v1/scans/${scanId}/shares/${shareId}`),

  myGroups: () =>
    api.get<GroupSummary[]>('/api/v1/scans/groups/mine').then((r) => r.data),

  searchUsers: (q: string) =>
    api.get<UserSummary[]>('/api/v1/scans/users/search', { params: { q } }).then((r) => r.data),
}

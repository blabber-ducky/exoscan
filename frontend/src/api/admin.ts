import { api } from './client'
import type { AdminUser, Group, GroupSummary } from '@/types'

export const adminApi = {
  listUsers: (search = '') =>
    api.get<AdminUser[]>('/api/v1/admin/users', { params: { search } }).then((r) => r.data),

  listGroups: () =>
    api.get<Group[]>('/api/v1/admin/groups').then((r) => r.data),

  createGroup: (name: string, description?: string) =>
    api.post<Group>('/api/v1/admin/groups', { name, description }).then((r) => r.data),

  deleteGroup: (groupId: string) =>
    api.delete(`/api/v1/admin/groups/${groupId}`),

  addMember: (groupId: string, userId: string) =>
    api.post(`/api/v1/admin/groups/${groupId}/members`, { user_id: userId }),

  removeMember: (groupId: string, userId: string) =>
    api.delete(`/api/v1/admin/groups/${groupId}/members/${userId}`),
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'

export function useAdminUsers(search = '') {
  return useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => adminApi.listUsers(search),
  })
}

export function useAdminGroups() {
  return useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: adminApi.listGroups,
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      adminApi.createGroup(name, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'groups'] }),
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) => adminApi.deleteGroup(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] })
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

export function useAddMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      adminApi.addMember(groupId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] })
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      adminApi.removeMember(groupId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] })
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

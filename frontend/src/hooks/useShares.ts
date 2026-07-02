import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sharesApi } from '@/api/shares'

export function useScanShares(scanId: string, enabled = true) {
  return useQuery({
    queryKey: ['shares', scanId],
    queryFn: () => sharesApi.listShares(scanId),
    enabled,
  })
}

export function useMyGroups() {
  return useQuery({
    queryKey: ['my-groups'],
    queryFn: sharesApi.myGroups,
  })
}

export function useUserSearch(q: string) {
  return useQuery({
    queryKey: ['user-search', q],
    queryFn: () => sharesApi.searchUsers(q),
    enabled: q.length >= 1,
  })
}

export function useShareWithUser(scanId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => sharesApi.shareWithUser(scanId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', scanId] }),
  })
}

export function useShareWithGroup(scanId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) => sharesApi.shareWithGroup(scanId, groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', scanId] }),
  })
}

export function useRevokeShare(scanId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (shareId: string) => sharesApi.revokeShare(scanId, shareId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', scanId] }),
  })
}

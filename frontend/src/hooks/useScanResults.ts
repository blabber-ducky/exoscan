import { useQuery } from '@tanstack/react-query'
import { scansApi } from '@/api/scans'

export function useScanResults(scanId: string | undefined) {
  return useQuery({
    queryKey: ['results', scanId],
    queryFn: () => scansApi.results(scanId!),
    enabled: !!scanId,
    staleTime: 30_000,
  })
}

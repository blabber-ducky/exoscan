import { AssetCard } from './AssetCard'
import type { ScanAsset } from '@/types'

export function AssetGrid({ assets, scanId }: { assets: ScanAsset[]; scanId: string }) {
  if (!assets.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">No assets discovered.</p>
    )
  }

  // Live assets first, then unreachable/timeout
  const sorted = [...assets].sort((a, b) => {
    if (a.scan_status === 'live' && b.scan_status !== 'live') return -1
    if (a.scan_status !== 'live' && b.scan_status === 'live') return 1
    return b.cves.length - a.cves.length
  })

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((asset) => (
        <AssetCard key={asset.id} asset={asset} scanId={scanId} />
      ))}
    </div>
  )
}

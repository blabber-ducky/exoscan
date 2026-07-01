import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Shield, AlertTriangle, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScanStatusBadge } from '@/components/scans/ScanStatusBadge'
import { PassiveReconPanel } from '@/components/results/PassiveReconPanel'
import { AssetGrid } from '@/components/results/AssetGrid'
import { useScanResults } from '@/hooks/useScanResults'

export function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useScanResults(id)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading results…</p>
  }

  if (error || !data) {
    return <p className="text-sm text-destructive">Failed to load results.</p>
  }

  const { scan, assets } = data
  const isPassive = scan.scan_type === 'passive' || scan.scan_type === 'comprehensive'
  const isActive = scan.scan_type === 'active' || scan.scan_type === 'comprehensive'

  // For passive panel: find main asset (matches the scan target hostname)
  const mainAsset =
    assets.find((a) => a.hostname === scan.target) ??
    assets.find((a) => !a.url) ??
    assets[0] ??
    null

  const totalCves = assets.reduce((sum, a) => sum + a.cves.length, 0)
  const liveCount = assets.filter((a) => a.scan_status === 'live').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <div className="font-mono text-lg font-semibold">{scan.target}</div>
          <div className="flex items-center gap-2 mt-1">
            <ScanStatusBadge status={scan.status} />
            <span className="text-xs text-muted-foreground capitalize">{scan.scan_type}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-semibold text-primary">{assets.length}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <Globe className="h-3 w-3" /> Assets
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-semibold text-primary">{liveCount}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <Shield className="h-3 w-3" /> Live
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className={`text-2xl font-semibold ${totalCves > 0 ? 'text-destructive' : 'text-primary'}`}>
              {totalCves}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3" /> CVEs
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Passive recon panel */}
      {isPassive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Passive Recon</CardTitle>
          </CardHeader>
          <CardContent>
            <PassiveReconPanel
              mainAsset={mainAsset}
              assets={assets}
              dorkHits={scan.dork_hits}
            />
          </CardContent>
        </Card>
      )}

      {/* Asset grid */}
      {isActive && assets.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Assets</h2>
            <Badge variant="secondary">{assets.length}</Badge>
          </div>
          <AssetGrid assets={assets} scanId={scan.id} />
        </div>
      )}

      {!isActive && assets.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Discovered Assets</h2>
            <Badge variant="secondary">{assets.length}</Badge>
          </div>
          <AssetGrid assets={assets} scanId={scan.id} />
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Shield, AlertTriangle, Globe, Zap, ShieldAlert, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScanStatusBadge } from '@/components/scans/ScanStatusBadge'
import { PassiveReconPanel } from '@/components/results/PassiveReconPanel'
import { AssetGrid } from '@/components/results/AssetGrid'
import { PentestResultsPanel } from '@/components/results/PentestResultsPanel'
import { PentestLaunchDialog } from '@/components/results/PentestLaunchDialog'
import { ActiveFollowupDialog } from '@/components/scans/ActiveFollowupDialog'
import { useScanResults } from '@/hooks/useScanResults'
import { useCreateScan } from '@/hooks/useScans'
import { SCAN_TYPE_LABELS } from '@/types'

export function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useScanResults(id)
  const createScan = useCreateScan()
  const [followupOpen, setFollowupOpen] = useState(false)
  const [pentestLaunchOpen, setPentestLaunchOpen] = useState(false)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading results…</p>
  }

  if (error || !data) {
    return <p className="text-sm text-destructive">Failed to load results.</p>
  }

  const { scan, assets } = data
  const isPentest = scan.scan_type === 'pentest'
  const isPassive = !isPentest && (scan.scan_type === 'passive' || scan.scan_type === 'comprehensive')
  const isActive = !isPentest && (scan.scan_type === 'active' || scan.scan_type === 'comprehensive')

  // For passive panel: find main asset (matches the scan target hostname)
  const mainAsset =
    assets.find((a) => a.hostname === scan.target) ??
    assets.find((a) => !a.url) ??
    assets[0] ??
    null

  const totalCves = assets.reduce((sum, a) => sum + a.cves.length, 0)
  const liveCount = assets.filter((a) => a.scan_status === 'live').length

  const canFollowup =
    !isPentest &&
    scan.is_owner &&
    scan.status === 'completed' &&
    (scan.scan_type === 'passive' || scan.scan_type === 'comprehensive') &&
    assets.length > 0

  const canLaunchPentest = !isPentest && scan.is_owner && scan.status === 'completed'

  const handleRerun = () => {
    if (isPentest) {
      setPentestLaunchOpen(true)
      return
    }
    createScan.mutate({
      target: scan.target,
      scan_type: scan.scan_type,
      modules: scan.modules,
      port_config: scan.port_config,
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-lg font-semibold truncate">{scan.target}</div>
          <div className="flex items-center gap-2 mt-1">
            <ScanStatusBadge status={scan.status} />
            <span className="text-xs text-muted-foreground">{SCAN_TYPE_LABELS[scan.scan_type]}</span>
          </div>
        </div>
        {canFollowup && (
          <Button size="sm" onClick={() => setFollowupOpen(true)} className="shrink-0 gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Active Recon Assets
          </Button>
        )}
        {canLaunchPentest && (
          <Button size="sm" variant="outline" onClick={() => setPentestLaunchOpen(true)} className="shrink-0 gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Run AI Pentest
          </Button>
        )}
        {scan.is_owner && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRerun}
            disabled={createScan.isPending || scan.status === 'running' || scan.status === 'pending'}
            className="shrink-0 gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-run
          </Button>
        )}
      </div>

      {canFollowup && (
        <ActiveFollowupDialog
          scanId={scan.id}
          assets={assets}
          open={followupOpen}
          onClose={() => setFollowupOpen(false)}
        />
      )}
      {canLaunchPentest && (
        <PentestLaunchDialog
          scan={scan}
          assets={assets}
          open={pentestLaunchOpen}
          onClose={() => setPentestLaunchOpen(false)}
        />
      )}

      {/* Stats row */}
      {isPentest ? (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-semibold text-primary">{scan.pentest_findings_count}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                <ShieldAlert className="h-3 w-3" /> Total Findings
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-semibold text-destructive">
                {scan.status === 'completed' ? '↓' : '—'}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                <AlertTriangle className="h-3 w-3" /> See findings below
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
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
      )}

      {/* Pentest results panel */}
      {isPentest && id && (
        <Card>
          <CardContent className="pt-6">
            <PentestResultsPanel scanId={id} />
          </CardContent>
        </Card>
      )}

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

      {!isActive && !isPentest && assets.length > 0 && (
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

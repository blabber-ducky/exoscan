import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Zap, Layers, ShieldAlert, ExternalLink, Share2, User, MoreVertical, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScanStatusBadge } from './ScanStatusBadge'
import { ShareDialog } from './ShareDialog'
import { PentestLaunchDialog } from '@/components/results/PentestLaunchDialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useCreateScan, useDeleteScan } from '@/hooks/useScans'
import { SCAN_TYPE_LABELS } from '@/types'
import type { Scan } from '@/types'

const TYPE_ICON: Record<Scan['scan_type'], typeof Globe> = {
  passive: Globe,
  active: Zap,
  comprehensive: Layers,
  pentest: ShieldAlert,
}

const isActiveStatus = (s: Scan['status']) => s === 'pending' || s === 'running'

export function ScanCard({ scan }: { scan: Scan }) {
  const createScan = useCreateScan()
  const deleteScan = useDeleteScan()
  const [shareOpen, setShareOpen] = useState(false)
  const [rerunPentestOpen, setRerunPentestOpen] = useState(false)

  const Icon = TYPE_ICON[scan.scan_type]

  const handleRerun = () => {
    if (scan.scan_type === 'pentest') {
      setRerunPentestOpen(true)
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
    <>
      <Card className="hover:border-primary/30 transition-colors">
        <CardContent className="p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-mono text-sm truncate">{scan.target}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <ScanStatusBadge status={scan.status} />
                <span className="text-xs text-muted-foreground">{SCAN_TYPE_LABELS[scan.scan_type]}</span>
                {!scan.is_owner && scan.owner_username && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <User className="h-3 w-3" />
                    {scan.owner_username}
                  </span>
                )}
                {scan.asset_count > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {scan.asset_count} asset{scan.asset_count !== 1 ? 's' : ''}
                  </span>
                )}
                {scan.cve_count > 0 && (
                  <span className="text-xs text-destructive font-medium">
                    {scan.cve_count} CVE{scan.cve_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(scan.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(scan.status === 'completed' || scan.status === 'running' || scan.status === 'pending') && (
              <Button variant="ghost" size="icon" asChild>
                <Link to={scan.status === 'completed' ? `/scans/${scan.id}/results` : `/scans/${scan.id}`}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {scan.is_owner && scan.status === 'completed' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShareOpen(true)}
                className="text-muted-foreground"
              >
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            {scan.is_owner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    disabled={createScan.isPending || deleteScan.isPending}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleRerun}
                    disabled={isActiveStatus(scan.status)}
                    className="gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Re-run
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => deleteScan.mutate(scan.id)}
                    className="text-destructive focus:text-destructive gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      {scan.is_owner && (
        <ShareDialog
          scanId={scan.id}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Pentest re-run dialog — assets empty since ScanCard only has counts */}
      {scan.is_owner && scan.scan_type === 'pentest' && (
        <PentestLaunchDialog
          scan={scan}
          assets={[]}
          open={rerunPentestOpen}
          onClose={() => setRerunPentestOpen(false)}
        />
      )}
    </>
  )
}

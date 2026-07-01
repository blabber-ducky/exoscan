import { Link } from 'react-router-dom'
import { Globe, Zap, Layers, Trash2, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScanStatusBadge } from './ScanStatusBadge'
import { useDeleteScan } from '@/hooks/useScans'
import type { Scan } from '@/types'

const TYPE_ICON: Record<Scan['scan_type'], typeof Globe> = {
  passive: Globe,
  active: Zap,
  comprehensive: Layers,
}

export function ScanCard({ scan }: { scan: Scan }) {
  const deleteScan = useDeleteScan()
  const Icon = TYPE_ICON[scan.scan_type]

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-mono text-sm truncate">{scan.target}</div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <ScanStatusBadge status={scan.status} />
              <span className="text-xs text-muted-foreground capitalize">{scan.scan_type}</span>
              {scan.asset_count > 0 && (
                <span className="text-xs text-muted-foreground">{scan.asset_count} asset{scan.asset_count !== 1 ? 's' : ''}</span>
              )}
              {scan.cve_count > 0 && (
                <span className="text-xs text-destructive font-medium">{scan.cve_count} CVE{scan.cve_count !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {new Date(scan.created_at).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {scan.status === 'completed' && (
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/scans/${scan.id}/results`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {scan.status === 'running' || scan.status === 'pending' ? (
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/scans/${scan.id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteScan.mutate(scan.id)}
            disabled={deleteScan.isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

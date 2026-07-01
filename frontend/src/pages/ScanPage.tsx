import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScanStatusBadge } from '@/components/scans/ScanStatusBadge'
import { ScanProgress } from '@/components/scans/ScanProgress'
import { LogViewer } from '@/components/scans/LogViewer'
import { useScan } from '@/hooks/useScans'
import { useScanLogs } from '@/hooks/useScanLogs'

export function ScanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: scan } = useScan(id)
  const { logs, wsStatus, terminalStatus } = useScanLogs(id)

  // Extract latest stage from logs for the progress indicator
  const latestStage = logs
    .filter((l) => l.type === 'log' && l.stage)
    .at(-1)?.stage ?? null

  // Auto-redirect to results when scan completes
  useEffect(() => {
    if (terminalStatus === 'completed' || scan?.status === 'completed') {
      const timer = setTimeout(() => navigate(`/scans/${id}/results`), 1500)
      return () => clearTimeout(timer)
    }
  }, [terminalStatus, scan?.status, id])

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="min-w-0">
          <div className="font-mono text-sm truncate">{scan?.target}</div>
          <div className="flex items-center gap-2 mt-1">
            {scan && <ScanStatusBadge status={scan.status} />}
            <span className="text-xs text-muted-foreground capitalize">{scan?.scan_type}</span>
          </div>
        </div>
      </div>

      {scan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <ScanProgress scan={scan} latestStage={latestStage} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Live Output</CardTitle>
          <span className="text-xs text-muted-foreground">
            {wsStatus === 'connecting' && 'Connecting…'}
            {wsStatus === 'connected' && '● Live'}
            {wsStatus === 'closed' && '○ Disconnected'}
          </span>
        </CardHeader>
        <CardContent>
          <LogViewer logs={logs} />
        </CardContent>
      </Card>

      {(terminalStatus === 'completed' || scan?.status === 'completed') && (
        <div className="flex justify-end">
          <Button asChild>
            <Link to={`/scans/${id}/results`}>
              View Results
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

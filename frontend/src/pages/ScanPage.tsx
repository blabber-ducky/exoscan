import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Pause, Play, X, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScanStatusBadge } from '@/components/scans/ScanStatusBadge'
import { ScanProgress } from '@/components/scans/ScanProgress'
import { LogViewer } from '@/components/scans/LogViewer'
import { EditScanDialog } from '@/components/scans/EditScanDialog'
import { useScan, useCancelScan, usePauseScan, useResumeScan } from '@/hooks/useScans'
import { useScanLogs } from '@/hooks/useScanLogs'

export function ScanPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: scan } = useScan(id)
  const { logs, wsStatus, terminalStatus } = useScanLogs(id)
  const [editOpen, setEditOpen] = useState(false)

  const cancelScan = useCancelScan()
  const pauseScan = usePauseScan()
  const resumeScan = useResumeScan()

  const latestStage = logs
    .filter((l) => l.type === 'log' && l.stage)
    .at(-1)?.stage ?? null

  useEffect(() => {
    if (terminalStatus === 'completed' || scan?.status === 'completed') {
      const timer = setTimeout(() => navigate(`/scans/${id}/results`), 1500)
      return () => clearTimeout(timer)
    }
  }, [terminalStatus, scan?.status, id])

  const handleCancel = () => {
    if (!id) return
    cancelScan.mutate(id, {
      onSuccess: () => toast.info('Scan cancelled'),
      onError: () => toast.error('Failed to cancel scan'),
    })
  }

  const handlePause = () => {
    if (!id) return
    pauseScan.mutate(id, {
      onSuccess: () => toast.success('Scan paused — will stop after current stage completes'),
      onError: () => toast.error('Failed to pause scan'),
    })
  }

  const handleResume = () => {
    if (!id) return
    resumeScan.mutate(id, {
      onSuccess: () => toast.success('Scan resumed'),
      onError: () => toast.error('Failed to resume scan'),
    })
  }

  const isBusy = cancelScan.isPending || pauseScan.isPending || resumeScan.isPending

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm truncate">{scan?.target}</div>
          <div className="flex items-center gap-2 mt-1">
            {scan && <ScanStatusBadge status={scan.status} />}
            <span className="text-xs text-muted-foreground capitalize">{scan?.scan_type}</span>
          </div>
        </div>

        {/* Lifecycle controls */}
        {scan?.is_owner && (
          <div className="flex items-center gap-1.5 shrink-0">
            {(scan.status === 'pending' || scan.status === 'paused') && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
            {scan.status === 'running' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={handlePause}
                disabled={isBusy}
              >
                {pauseScan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                Pause
              </Button>
            )}
            {scan.status === 'paused' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs text-primary border-primary/40"
                onClick={handleResume}
                disabled={isBusy}
              >
                {resumeScan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Resume
              </Button>
            )}
            {['pending', 'running', 'paused'].includes(scan.status) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={handleCancel}
                disabled={isBusy}
              >
                {cancelScan.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {scan && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ScanProgress scan={scan} latestStage={latestStage} />
            </CardContent>
          </Card>

          <EditScanDialog
            scan={scan}
            open={editOpen}
            onClose={() => setEditOpen(false)}
          />
        </>
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

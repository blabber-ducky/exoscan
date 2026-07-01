import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScanCard } from '@/components/scans/ScanCard'
import { NewScanForm } from '@/components/scans/NewScanForm'
import { useScanList } from '@/hooks/useScans'

export function DashboardPage() {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useScanList()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Scans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total ?? 0} scan{data?.total !== 1 ? 's' : ''} total
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New Scan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Scan</DialogTitle>
            </DialogHeader>
            <NewScanForm onClose={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && !data?.items.length && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-muted-foreground">No scans yet.</p>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Launch your first scan
            </Button>
          </CardContent>
        </Card>
      )}

      {data?.items && data.items.length > 0 && (
        <div className="space-y-3">
          {data.items.map((scan) => (
            <ScanCard key={scan.id} scan={scan} />
          ))}
        </div>
      )}
    </div>
  )
}

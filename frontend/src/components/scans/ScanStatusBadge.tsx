import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Scan } from '@/types'

const STATUS_STYLES: Record<Scan['status'], string> = {
  pending: 'border-muted-foreground/40 text-muted-foreground',
  running: 'border-primary/60 text-primary bg-primary/10 animate-pulse',
  completed: 'border-green-500/60 text-green-400 bg-green-500/10',
  failed: 'border-destructive/60 text-destructive bg-destructive/10',
  cancelled: 'border-muted-foreground/40 text-muted-foreground',
}

export function ScanStatusBadge({ status }: { status: Scan['status'] }) {
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_STYLES[status])}>
      {status}
    </Badge>
  )
}

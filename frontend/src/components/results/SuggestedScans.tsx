import { Play, Loader, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTriggerSuggested } from '@/hooks/useScans'
import type { SuggestedScan } from '@/types'

const RISK_STYLE: Record<SuggestedScan['risk_level'], string> = {
  HIGH: 'border-orange-500/60 text-orange-400',
  MEDIUM: 'border-yellow-500/60 text-yellow-400',
  LOW: 'border-muted-foreground/40 text-muted-foreground',
}

const STATUS_ICON = {
  suggested: Play,
  running: Loader,
  completed: CheckCircle,
  failed: XCircle,
}

export function SuggestedScans({ scanId, suggestions }: { scanId: string; suggestions: SuggestedScan[] }) {
  const trigger = useTriggerSuggested(scanId)

  if (!suggestions.length) return null

  return (
    <div className="space-y-2">
      {suggestions.sort((a, b) => b.priority - a.priority).map((s) => {
        const StatusIcon = STATUS_ICON[s.status]
        const canTrigger = s.status === 'suggested' || s.status === 'failed'

        return (
          <div key={s.id} className="flex items-start gap-2.5 text-xs rounded-md border border-border p-2.5">
            <Badge variant="outline" className={cn('shrink-0 text-[10px]', RISK_STYLE[s.risk_level])}>
              {s.risk_level}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">{s.display_name}</div>
              {s.description && <p className="text-muted-foreground mt-0.5">{s.description}</p>}
              {s.result_summary && (
                <p className="text-primary/80 mt-0.5 font-mono text-[10px]">{s.result_summary}</p>
              )}
            </div>
            <Button
              size="icon"
              variant={canTrigger ? 'outline' : 'ghost'}
              className={cn('h-6 w-6 shrink-0', s.status === 'running' && 'cursor-not-allowed', s.status === 'completed' && 'text-primary', s.status === 'failed' && 'text-destructive')}
              disabled={!canTrigger || trigger.isPending}
              onClick={() => {
                if (!canTrigger) return
                trigger.mutate(s.id, {
                  onError: () => toast.error('Failed to trigger scan'),
                  onSuccess: () => toast.success('Scan triggered'),
                })
              }}
            >
              <StatusIcon className={cn('h-3.5 w-3.5', s.status === 'running' && 'animate-spin')} />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

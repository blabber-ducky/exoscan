import { Check, Circle, Loader } from 'lucide-react'
import type { Scan } from '@/types'

const STAGES: { key: string; label: string; types: Scan['scan_type'][] }[] = [
  { key: 'passive', label: 'Passive Recon', types: ['passive', 'comprehensive'] },
  { key: 'probe', label: 'Liveness Probe', types: ['active', 'comprehensive'] },
  { key: 'active', label: 'Active Recon', types: ['active', 'comprehensive'] },
  { key: 'suggestions', label: 'Suggestions', types: ['active', 'comprehensive'] },
  { key: 'preparing', label: 'Preparing', types: ['pentest'] },
  { key: 'ai_pentest', label: 'AI Pentest', types: ['pentest'] },
  { key: 'parsing', label: 'Parsing Findings', types: ['pentest'] },
]

function stageState(
  stageKey: string,
  scan: Scan,
  latestStage: string | null,
): 'done' | 'active' | 'pending' | 'skip' {
  const def = STAGES.find((s) => s.key === stageKey)
  if (!def || !def.types.includes(scan.scan_type)) return 'skip'

  if (scan.status === 'completed') return 'done'
  if (scan.status === 'failed') return 'skip'

  const order = STAGES.map((s) => s.key)
  const thisIdx = order.indexOf(stageKey)
  const activeIdx = latestStage ? order.indexOf(latestStage) : -1

  if (thisIdx < activeIdx) return 'done'
  if (thisIdx === activeIdx) return 'active'
  return 'pending'
}

export function ScanProgress({ scan, latestStage }: { scan: Scan; latestStage: string | null }) {
  const relevant = STAGES.filter((s) => s.types.includes(scan.scan_type))

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {relevant.map((stage, i) => {
        const state = stageState(stage.key, scan, latestStage)
        return (
          <div key={stage.key} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {state === 'done' && <Check className="h-3.5 w-3.5 text-primary" />}
              {state === 'active' && <Loader className="h-3.5 w-3.5 text-primary animate-spin" />}
              {state === 'pending' && <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={state === 'pending' ? 'text-xs text-muted-foreground' : 'text-xs text-foreground'}>
                {stage.label}
              </span>
            </div>
            {i < relevant.length - 1 && <div className="h-px w-4 bg-border" />}
          </div>
        )
      })}
    </div>
  )
}

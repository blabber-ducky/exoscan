import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CVE } from '@/types'

const SEV_STYLE: Record<string, string> = {
  CRITICAL: 'border-red-500/60 text-red-400 bg-red-500/10',
  HIGH: 'border-orange-500/60 text-orange-400 bg-orange-500/10',
  MEDIUM: 'border-yellow-500/60 text-yellow-400 bg-yellow-500/10',
  LOW: 'border-muted-foreground/40 text-muted-foreground',
}

export function CVEList({ cves }: { cves: CVE[] }) {
  if (!cves.length) return null

  return (
    <div className="space-y-1.5">
      {cves.map((cve) => (
        <div key={cve.id} className="flex items-start gap-2 text-xs">
          <Badge
            variant="outline"
            className={cn('shrink-0 font-mono', SEV_STYLE[cve.severity ?? ''] ?? '')}
          >
            {cve.severity ?? '?'}
          </Badge>
          <div className="min-w-0">
            <a
              href={cve.nvd_url ?? `https://nvd.nist.gov/vuln/detail/${cve.cve_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-primary hover:underline inline-flex items-center gap-1"
            >
              {cve.cve_id}
              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
            </a>
            {cve.cvss_score != null && (
              <span className="ml-1.5 text-muted-foreground">CVSS {cve.cvss_score}</span>
            )}
            {cve.description && (
              <p className="text-muted-foreground mt-0.5 line-clamp-2">{cve.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

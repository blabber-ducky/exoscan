import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { Technology } from '@/types'

export function TechBadge({ tech }: { tech: Technology }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="font-mono text-xs cursor-default">
            {tech.name}
            {tech.version && <span className="ml-1 opacity-60">{tech.version}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {tech.confidence != null && <p>Confidence: {tech.confidence}%</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

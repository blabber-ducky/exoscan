import { useState } from 'react'
import { Shield, AlertTriangle, WifiOff, Image, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TechBadge } from './TechBadge'
import { CVEList } from './CVEList'
import { SuggestedScans } from './SuggestedScans'
import { cn } from '@/lib/utils'
import type { ScanAsset } from '@/types'

const STATUS_ICON = {
  live: Shield,
  unreachable: WifiOff,
  timeout: AlertTriangle,
  filtered: AlertTriangle,
}

export function AssetCard({ asset, scanId }: { asset: ScanAsset; scanId: string }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = STATUS_ICON[asset.scan_status]
  const isLive = asset.scan_status === 'live'
  const screenshotUrl = asset.screenshot_path ? `/static/screenshots/${asset.screenshot_path}` : null

  return (
    <Card className={cn('overflow-hidden', !isLive && 'opacity-70')}>
      {screenshotUrl && (
        <div className="border-b border-border bg-black/20 h-32 overflow-hidden relative group">
          <img
            src={screenshotUrl}
            alt={`Screenshot of ${asset.hostname ?? asset.url}`}
            className="w-full h-full object-cover object-top"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
            <Image className="h-5 w-5 text-white" />
          </div>
        </div>
      )}

      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-sm truncate font-medium">
              {asset.hostname ?? asset.url ?? asset.ip_address ?? 'Unknown'}
            </div>
            {asset.url && asset.hostname && (
              <div className="font-mono text-xs text-muted-foreground truncate">{asset.url}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Icon className={cn('h-3.5 w-3.5', isLive ? 'text-primary' : 'text-muted-foreground')} />
            {asset.status_code && (
              <Badge variant="outline" className="text-xs font-mono">
                {asset.status_code}
              </Badge>
            )}
            {asset.waf_detected && (
              <Badge variant="outline" className="text-xs border-yellow-500/60 text-yellow-400">
                WAF: {asset.waf_detected}
              </Badge>
            )}
          </div>
        </div>

        {asset.title && (
          <p className="text-xs text-muted-foreground truncate">{asset.title}</p>
        )}

        {/* Tech badges */}
        {asset.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.technologies.slice(0, 6).map((t, i) => (
              <TechBadge key={i} tech={t} />
            ))}
            {asset.technologies.length > 6 && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                +{asset.technologies.length - 6}
              </Badge>
            )}
          </div>
        )}

        {/* Summary row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {asset.open_ports.length > 0 && (
            <span>{asset.open_ports.length} port{asset.open_ports.length !== 1 ? 's' : ''}</span>
          )}
          {asset.cves.length > 0 && (
            <span className="text-destructive">{asset.cves.length} CVE{asset.cves.length !== 1 ? 's' : ''}</span>
          )}
          {asset.suggestions.length > 0 && (
            <span>{asset.suggestions.length} suggestion{asset.suggestions.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Expand toggle */}
        {(asset.open_ports.length > 0 || asset.cves.length > 0 || asset.suggestions.length > 0) && (
          <>
            <Separator />
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-6 text-xs text-muted-foreground"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
              {expanded ? 'Less' : 'Details'}
            </Button>

            {expanded && (
              <Tabs defaultValue={asset.cves.length > 0 ? 'cves' : asset.open_ports.length > 0 ? 'ports' : 'suggested'}>
                <TabsList className="h-7 text-xs">
                  {asset.open_ports.length > 0 && <TabsTrigger value="ports" className="text-xs h-6">Ports ({asset.open_ports.length})</TabsTrigger>}
                  {asset.cves.length > 0 && <TabsTrigger value="cves" className="text-xs h-6">CVEs ({asset.cves.length})</TabsTrigger>}
                  {asset.suggestions.length > 0 && <TabsTrigger value="suggested" className="text-xs h-6">Suggested ({asset.suggestions.length})</TabsTrigger>}
                </TabsList>
                {asset.open_ports.length > 0 && (
                  <TabsContent value="ports" className="text-xs space-y-1 mt-2">
                    {asset.open_ports.map((p, i) => (
                      <div key={i} className="flex gap-2 font-mono">
                        <span className="text-primary">{p.port}/{p.protocol}</span>
                        <span className="text-muted-foreground">{p.service}</span>
                        {p.version && <span className="text-foreground/60">{p.version}</span>}
                      </div>
                    ))}
                  </TabsContent>
                )}
                {asset.cves.length > 0 && (
                  <TabsContent value="cves" className="mt-2">
                    <CVEList cves={asset.cves} />
                  </TabsContent>
                )}
                {asset.suggestions.length > 0 && (
                  <TabsContent value="suggested" className="mt-2">
                    <SuggestedScans scanId={scanId} suggestions={asset.suggestions} />
                  </TabsContent>
                )}
              </Tabs>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

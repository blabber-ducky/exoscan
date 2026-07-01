import { ExternalLink } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { DnsRecord, DorkHit, ScanAsset } from '@/types'

function DnsTable({ records }: { records: DnsRecord[] }) {
  const filtered = records.filter((r) => r.type !== 'ip_info')
  if (!filtered.length) return <p className="text-sm text-muted-foreground">No DNS records.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left pb-1.5 pr-4 font-medium">Type</th>
            <th className="text-left pb-1.5 pr-4 font-medium">Name</th>
            <th className="text-left pb-1.5 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0">
              <td className="py-1 pr-4">
                <Badge variant="outline" className="text-[10px] font-mono">{r.type}</Badge>
              </td>
              <td className="py-1 pr-4 text-muted-foreground">{String(r.name ?? '')}</td>
              <td className="py-1 text-foreground break-all">{String(r.value ?? '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubdomainList({ assets }: { assets: ScanAsset[] }) {
  const subs = assets.filter((a) => a.hostname)
  if (!subs.length) return <p className="text-sm text-muted-foreground">No subdomains discovered.</p>
  return (
    <div className="space-y-1">
      {subs.map((a) => (
        <div key={a.id} className="flex items-center gap-2 text-sm font-mono">
          <span className={a.scan_status === 'live' ? 'text-primary' : 'text-muted-foreground'}>●</span>
          <span>{a.hostname}</span>
          {a.ip_address && <span className="text-muted-foreground text-xs">{a.ip_address}</span>}
          <Badge variant="outline" className="text-[10px] ml-auto">{a.scan_status}</Badge>
        </div>
      ))}
    </div>
  )
}

function DorkHitList({ hits }: { hits: DorkHit[] }) {
  if (!hits.length) return <p className="text-sm text-muted-foreground">No dork results.</p>
  return (
    <div className="space-y-3">
      {hits.map((h, i) => (
        <div key={i} className="text-sm">
          <a
            href={h.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
          >
            {h.title || h.url}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{h.url}</p>
          {h.snippet && <p className="text-xs text-foreground/70 mt-0.5 line-clamp-2">{h.snippet}</p>}
          <p className="text-xs text-muted-foreground/60 mt-0.5 italic">{h.query}</p>
        </div>
      ))}
    </div>
  )
}

export function PassiveReconPanel({
  mainAsset,
  assets,
  dorkHits,
}: {
  mainAsset: ScanAsset | null
  assets: ScanAsset[]
  dorkHits: DorkHit[]
}) {
  const dnsRecords = mainAsset?.dns_records ?? []
  const subdomainAssets = assets.filter((a) => a !== mainAsset)

  return (
    <Tabs defaultValue="dns">
      <TabsList>
        <TabsTrigger value="dns">DNS ({dnsRecords.filter((r) => r.type !== 'ip_info').length})</TabsTrigger>
        <TabsTrigger value="subdomains">Subdomains ({subdomainAssets.length})</TabsTrigger>
        <TabsTrigger value="dorks">Dork Hits ({dorkHits.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="dns" className="mt-4">
        <DnsTable records={dnsRecords} />
      </TabsContent>
      <TabsContent value="subdomains" className="mt-4">
        <SubdomainList assets={subdomainAssets} />
      </TabsContent>
      <TabsContent value="dorks" className="mt-4">
        <DorkHitList hits={dorkHits} />
      </TabsContent>
    </Tabs>
  )
}

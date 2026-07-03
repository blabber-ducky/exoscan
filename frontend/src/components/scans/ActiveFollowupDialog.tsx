import { useState, useMemo } from 'react'
import { Zap, AlertTriangle, Loader2, CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFollowupActive } from '@/hooks/useScans'
import type { ScanAsset } from '@/types'

const ACTIVE_MODULES = [
  { key: 'tech_fingerprinting', label: 'Technology Fingerprinting', desc: 'WhatWeb — CMS, server, frameworks' },
  { key: 'screenshot_capture', label: 'Screenshot Capture', desc: 'GoWitness — visual snapshot' },
  { key: 'cve_detection', label: 'CVE Detection', desc: 'NVD API — requires tech fingerprinting', requiresTech: true },
  { key: 'port_scan', label: 'Port & Service Scan', desc: 'nmap -sV — open ports and versions' },
]

type PortPreset = 'top100' | 'top1000' | 'http_only' | 'custom'

const PORT_PRESETS: { value: PortPreset; label: string }[] = [
  { value: 'top100', label: 'Top 100' },
  { value: 'top1000', label: 'Top 1000' },
  { value: 'http_only', label: 'HTTP/S Only' },
  { value: 'custom', label: 'Custom' },
]

const STATUS_LABEL: Record<string, string> = {
  live: 'Live',
  unreachable: 'Unreachable',
  timeout: 'Timeout',
  filtered: 'Filtered',
}

interface Props {
  scanId: string
  assets: ScanAsset[]
  open: boolean
  onClose: () => void
}

function assetLabel(a: ScanAsset) {
  return a.hostname ?? a.url ?? a.ip_address ?? 'unknown'
}

export function ActiveFollowupDialog({ scanId, assets, open, onClose }: Props) {
  const [modules, setModules] = useState<Set<string>>(
    new Set(['tech_fingerprinting', 'screenshot_capture', 'cve_detection', 'port_scan'])
  )
  const [portPreset, setPortPreset] = useState<PortPreset>('top1000')
  const [customPorts, setCustomPorts] = useState('')
  const [portsError, setPortsError] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(assets.map((a) => a.id)))
  const [assetFilter, setAssetFilter] = useState('')
  const [assetSectionOpen, setAssetSectionOpen] = useState(false)

  const followup = useFollowupActive(scanId)

  const hasTech = modules.has('tech_fingerprinting')

  const filteredAssets = useMemo(() => {
    if (!assetFilter.trim()) return assets
    const q = assetFilter.toLowerCase()
    return assets.filter((a) => assetLabel(a).toLowerCase().includes(q))
  }, [assets, assetFilter])

  // Group assets by status for group-select
  const byStatus = useMemo(() => {
    const groups: Record<string, ScanAsset[]> = {}
    for (const a of assets) {
      ;(groups[a.scan_status] ??= []).push(a)
    }
    return groups
  }, [assets])

  const toggleModule = (key: string) => {
    setModules((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        if (key === 'tech_fingerprinting') next.delete('cve_detection')
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleAsset = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectGroup = (status: string) => {
    const ids = (byStatus[status] ?? []).map((a) => a.id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }

  const deselectGroup = (status: string) => {
    const ids = new Set((byStatus[status] ?? []).map((a) => a.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  const allSelected = assets.every((a) => selectedIds.has(a.id))

  const validatePorts = () => {
    if (portPreset !== 'custom') return true
    if (!customPorts.trim()) {
      setPortsError('Enter ports or ranges, e.g. 80,443,8080-8090')
      return false
    }
    if (!/^[\d,\-]+$/.test(customPorts.trim())) {
      setPortsError('Only digits, commas, and hyphens allowed')
      return false
    }
    setPortsError('')
    return true
  }

  const handleSubmit = () => {
    if (!validatePorts()) return
    if (modules.size === 0 || selectedIds.size === 0) return

    followup.mutate(
      {
        modules: [...modules],
        port_config:
          portPreset === 'custom'
            ? { preset: 'custom', ports: customPorts.trim() }
            : { preset: portPreset },
        asset_ids: [...selectedIds],
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.created_scans.length} active recon${result.created_scans.length !== 1 ? 's' : ''} started`,
            {
              description:
                result.skipped > 0
                  ? `${result.skipped} asset${result.skipped !== 1 ? 's' : ''} skipped (no usable target)`
                  : 'Check the dashboard to monitor progress.',
            }
          )
          onClose()
        },
        onError: () => toast.error('Failed to start follow-up recons'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Run Active Recon on Discovered Assets
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Asset selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Assets
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {selectedIds.size} / {assets.length} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() =>
                    allSelected
                      ? setSelectedIds(new Set())
                      : setSelectedIds(new Set(assets.map((a) => a.id)))
                  }
                >
                  {allSelected ? (
                    <><Square className="h-3 w-3 mr-1" /> None</>
                  ) : (
                    <><CheckSquare className="h-3 w-3 mr-1" /> All</>
                  )}
                </Button>
              </div>
            </div>

            {/* Group quick-select by status */}
            {Object.keys(byStatus).length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(byStatus).map(([st, group]) => {
                  const allIn = group.every((a) => selectedIds.has(a.id))
                  return (
                    <Button
                      key={st}
                      size="sm"
                      variant={allIn ? 'default' : 'outline'}
                      className="h-6 text-xs gap-1"
                      onClick={() => (allIn ? deselectGroup(st) : selectGroup(st))}
                    >
                      {STATUS_LABEL[st] ?? st} ({group.length})
                    </Button>
                  )
                })}
              </div>
            )}

            {/* Asset list — collapsible when there are many */}
            <div className="rounded-md border border-border">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                onClick={() => setAssetSectionOpen((v) => !v)}
              >
                <span>Select individual assets</span>
                {assetSectionOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {assetSectionOpen && (
                <div className="border-t border-border p-2 space-y-2">
                  <Input
                    placeholder="Filter assets…"
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {filteredAssets.map((a) => (
                      <label
                        key={a.id}
                        className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={selectedIds.has(a.id)}
                          onCheckedChange={() => toggleAsset(a.id)}
                          className="shrink-0"
                        />
                        <span className="font-mono text-xs truncate flex-1">{assetLabel(a)}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 ${
                            a.scan_status === 'live'
                              ? 'border-green-500/40 text-green-400'
                              : 'border-muted-foreground/40 text-muted-foreground'
                          }`}
                        >
                          {a.scan_status}
                        </Badge>
                      </label>
                    ))}
                    {filteredAssets.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">No assets match filter</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedIds.size > 20 && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400 px-3 py-2 text-xs">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {selectedIds.size} active scans will run in parallel. Consider selecting a subset to avoid overloading the system.
                </span>
              </div>
            )}
          </div>

          {/* Modules */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modules</p>
            {ACTIVE_MODULES.map((m) => {
              const disabled = m.requiresTech && !hasTech
              return (
                <label
                  key={m.key}
                  className={`flex items-start gap-3 cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <Checkbox
                    checked={modules.has(m.key)}
                    onCheckedChange={() => !disabled && toggleModule(m.key)}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>

          {/* Port config */}
          {modules.has('port_scan') && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Port Range</p>
              <div className="flex gap-1.5 flex-wrap">
                {PORT_PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    size="sm"
                    variant={portPreset === p.value ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setPortPreset(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              {portPreset === 'custom' && (
                <div className="space-y-1">
                  <Input
                    placeholder="e.g. 80,443,8080-8090"
                    value={customPorts}
                    onChange={(e) => { setCustomPorts(e.target.value); setPortsError('') }}
                    className="h-8 text-sm font-mono"
                  />
                  {portsError && <p className="text-xs text-destructive">{portsError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={followup.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={modules.size === 0 || selectedIds.size === 0 || followup.isPending}
            >
              {followup.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Starting…</>
              ) : (
                `Start ${selectedIds.size} Recon${selectedIds.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

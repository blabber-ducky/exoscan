import { useState } from 'react'
import { Zap, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCreateScan } from '@/hooks/useScans'
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

function buildTarget(asset: ScanAsset): string {
  if (asset.url) return asset.url
  if (asset.hostname) return `https://${asset.hostname}`
  return asset.ip_address ?? ''
}

interface Props {
  asset: ScanAsset
  open: boolean
  onClose: () => void
}

export function AssetScanDialog({ asset, open, onClose }: Props) {
  const [modules, setModules] = useState<Set<string>>(
    new Set(['tech_fingerprinting', 'screenshot_capture', 'cve_detection', 'port_scan'])
  )
  const [portPreset, setPortPreset] = useState<PortPreset>('top1000')
  const [customPorts, setCustomPorts] = useState('')
  const [portsError, setPortsError] = useState('')

  const createScan = useCreateScan()

  const hasTech = modules.has('tech_fingerprinting')
  const target = buildTarget(asset)

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
    if (!validatePorts() || modules.size === 0 || !target) return

    createScan.mutate(
      {
        target,
        scan_type: 'active',
        modules: [...modules],
        port_config:
          portPreset === 'custom'
            ? { preset: 'custom', ports: customPorts.trim() }
            : { preset: portPreset },
      },
      {
        onSuccess: () => {
          toast.success(`Active scan started for ${asset.hostname ?? target}`)
          onClose()
        },
        onError: () => toast.error('Failed to start scan'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Active Scan — {asset.hostname ?? target}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-xs text-muted-foreground font-mono truncate">Target: {target}</p>

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

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={createScan.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={modules.size === 0 || !target || createScan.isPending}
            >
              {createScan.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Starting…</>
              ) : 'Start Scan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

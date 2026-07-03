import { useState } from 'react'
import { Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePatchScan } from '@/hooks/useScans'
import type { Scan } from '@/types'

const PASSIVE_MODULES = [
  { key: 'dns_recon', label: 'DNS Recon', desc: 'dnsrecon — A/MX/NS/TXT/CNAME records' },
  { key: 'ip_profiling', label: 'IP Profiling', desc: 'ipinfo.io — ASN, org, country' },
  { key: 'asset_identification', label: 'Asset Identification', desc: 'subfinder + crt.sh + DuckDuckGo dorking' },
]

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

interface Props {
  scan: Scan
  open: boolean
  onClose: () => void
}

export function EditScanDialog({ scan, open, onClose }: Props) {
  const [modules, setModules] = useState<Set<string>>(new Set(scan.modules))
  const [portPreset, setPortPreset] = useState<PortPreset>(
    (scan.port_config?.preset as PortPreset) ?? 'top1000'
  )
  const [customPorts, setCustomPorts] = useState(scan.port_config?.ports ?? '')
  const [portsError, setPortsError] = useState('')

  const patch = usePatchScan(scan.id)

  const visibleModules =
    scan.scan_type === 'passive'
      ? PASSIVE_MODULES
      : scan.scan_type === 'active'
        ? ACTIVE_MODULES
        : [...PASSIVE_MODULES, ...ACTIVE_MODULES]

  const hasTech = modules.has('tech_fingerprinting')

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

  const handleSave = () => {
    if (!validatePorts()) return
    if (modules.size === 0) return

    const portConfig =
      portPreset === 'custom'
        ? { preset: 'custom' as const, ports: customPorts.trim() }
        : { preset: portPreset }

    patch.mutate(
      { modules: [...modules], port_config: portConfig },
      {
        onSuccess: () => {
          toast.success('Recon updated')
          onClose()
        },
        onError: () => toast.error('Failed to update recon'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit Recon — {scan.target}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {scan.status === 'paused' && scan.completed_stages.length > 0 && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400 px-3 py-2 text-xs">
              Paused after: {scan.completed_stages.join(' → ')}. Changes apply to remaining stages only.
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modules</p>
            {visibleModules.map((m) => {
              const disabled = 'requiresTech' in m && m.requiresTech && !hasTech
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

          {(scan.scan_type === 'active' || scan.scan_type === 'comprehensive') &&
            modules.has('port_scan') && (
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
            <Button variant="outline" onClick={onClose} disabled={patch.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={modules.size === 0 || patch.isPending}>
              {patch.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</>
              ) : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

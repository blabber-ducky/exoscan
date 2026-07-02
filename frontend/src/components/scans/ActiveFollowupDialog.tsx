import { useState } from 'react'
import { Zap, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useFollowupActive } from '@/hooks/useScans'

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
  scanId: string
  assetCount: number
  open: boolean
  onClose: () => void
}

export function ActiveFollowupDialog({ scanId, assetCount, open, onClose }: Props) {
  const [modules, setModules] = useState<Set<string>>(
    new Set(['tech_fingerprinting', 'screenshot_capture', 'cve_detection', 'port_scan'])
  )
  const [portPreset, setPortPreset] = useState<PortPreset>('top1000')
  const [customPorts, setCustomPorts] = useState('')
  const [portsError, setPortsError] = useState('')

  const followup = useFollowupActive(scanId)

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

  const handleSubmit = () => {
    if (!validatePorts()) return
    if (modules.size === 0) return

    followup.mutate(
      {
        modules: [...modules],
        port_config:
          portPreset === 'custom'
            ? { preset: 'custom', ports: customPorts.trim() }
            : { preset: portPreset },
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.created_scans.length} active scan${result.created_scans.length !== 1 ? 's' : ''} started`,
            {
              description:
                result.skipped > 0
                  ? `${result.skipped} asset${result.skipped !== 1 ? 's' : ''} skipped (no usable target)`
                  : 'Check the dashboard to monitor progress.',
            }
          )
          onClose()
        },
        onError: () => {
          toast.error('Failed to start follow-up scans')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Run Active Scan on Discovered Assets
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Asset count banner */}
          <div className={`rounded-md border px-3 py-2 text-sm flex items-start gap-2 ${assetCount > 20 ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400' : 'border-border bg-muted/40 text-muted-foreground'}`}>
            {assetCount > 20 && <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
            <span>
              <span className="font-medium text-foreground">{assetCount}</span> asset{assetCount !== 1 ? 's' : ''} discovered —
              {assetCount > 20
                ? ` this will create up to ${assetCount} active scans running in parallel.`
                : ' one active scan will be created per asset.'}
            </span>
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

          {/* Port config — only shown when port_scan selected */}
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
              disabled={modules.size === 0 || followup.isPending}
            >
              {followup.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Starting…</>
              ) : (
                `Start ${assetCount} Scan${assetCount !== 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

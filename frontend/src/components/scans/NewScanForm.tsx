import { useState } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { Globe, Zap, Layers, ChevronRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCreateScan } from '@/hooks/useScans'
import { cn } from '@/lib/utils'

type ScanType = 'passive' | 'active' | 'comprehensive'
type PortPreset = 'top100' | 'top1000' | 'http_only' | 'custom'

const PASSIVE_MODULES = [
  { key: 'dns_recon', label: 'DNS Recon', desc: 'dnsrecon — A/MX/NS/TXT/CNAME records' },
  { key: 'ip_profiling', label: 'IP Profiling', desc: 'ipinfo.io — ASN, org, country' },
  { key: 'asset_identification', label: 'Asset Identification', desc: 'subfinder + crt.sh + DuckDuckGo dorking' },
]

const ACTIVE_MODULES = [
  { key: 'tech_fingerprinting', label: 'Technology Fingerprinting', desc: 'WhatWeb — CMS, server, frameworks' },
  { key: 'screenshot_capture', label: 'Screenshot Capture', desc: 'GoWitness — visual snapshot of each asset' },
  { key: 'cve_detection', label: 'CVE Detection', desc: 'NVD API — known CVEs for detected technologies', requiresTech: true },
  { key: 'port_scan', label: 'Port & Service Scan', desc: 'nmap -sV — open ports and service versions' },
]

const PORT_PRESETS: { key: PortPreset; label: string }[] = [
  { key: 'top100', label: 'Top 100' },
  { key: 'top1000', label: 'Top 1000' },
  { key: 'http_only', label: 'HTTP/S Only' },
  { key: 'custom', label: 'Custom' },
]

const urlRe = /^https?:\/\/.+/
const domainRe = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/
const portRangeRe = /^[\d,\-]+$/

function isValidTarget(target: string, type: ScanType) {
  if (type === 'active') return urlRe.test(target) || ipv4Re.test(target)
  return domainRe.test(target) || ipv4Re.test(target)
}

export function NewScanForm({ onClose }: { onClose?: () => void }) {
  const createScan = useCreateScan()

  const [step, setStep] = useState(1)
  const [scanType, setScanType] = useState<ScanType>('comprehensive')
  const [target, setTarget] = useState('')
  const [targetError, setTargetError] = useState('')
  const [modules, setModules] = useState<Set<string>>(
    new Set(['dns_recon', 'ip_profiling', 'asset_identification', 'tech_fingerprinting', 'screenshot_capture', 'cve_detection', 'port_scan'])
  )
  const [portPreset, setPortPreset] = useState<PortPreset>('top1000')
  const [customPorts, setCustomPorts] = useState('')
  const [portsError, setPortsError] = useState('')

  const visiblePassive = scanType !== 'active' ? PASSIVE_MODULES : []
  const visibleActive = scanType !== 'passive' ? ACTIVE_MODULES : []
  const showPortConfig = modules.has('port_scan') && scanType !== 'passive'

  const toggleModule = (key: string) => {
    setModules((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        if (key === 'tech_fingerprinting') next.delete('cve_detection')
      } else {
        next.add(key)
        if (key === 'cve_detection') next.add('tech_fingerprinting')
      }
      return next
    })
  }

  const validateTarget = () => {
    if (!target.trim()) { setTargetError('Target is required'); return false }
    if (!isValidTarget(target.trim(), scanType)) {
      setTargetError(
        scanType === 'active'
          ? 'Active scans require a full URL (https://...) or IPv4'
          : 'Passive/comprehensive scans require a domain or IPv4'
      )
      return false
    }
    setTargetError('')
    return true
  }

  const validatePorts = () => {
    if (portPreset === 'custom') {
      if (!customPorts.trim()) { setPortsError('Port range is required for custom preset'); return false }
      if (!portRangeRe.test(customPorts.trim())) { setPortsError('Use comma-separated ports/ranges, e.g. 80,443,8080-8090'); return false }
    }
    setPortsError('')
    return true
  }

  const goNext = () => {
    if (step === 2 && !validateTarget()) return
    if (step === 3) {
      const activeCount = [...modules].filter((m) => ACTIVE_MODULES.some((a) => a.key === m))
      const passiveCount = [...modules].filter((m) => PASSIVE_MODULES.some((p) => p.key === m))
      if (scanType === 'passive' && passiveCount === 0) { toast.error('Select at least one passive module'); return }
      if (scanType === 'active' && activeCount === 0) { toast.error('Select at least one active module'); return }
      if (!showPortConfig) { handleSubmit(); return }
    }
    setStep((s) => s + 1)
  }

  const handleSubmit = () => {
    if (!validatePorts()) return
    const allowedKeys = new Set([
      ...(scanType !== 'active' ? PASSIVE_MODULES.map((m) => m.key) : []),
      ...(scanType !== 'passive' ? ACTIVE_MODULES.map((m) => m.key) : []),
    ])
    createScan.mutate(
      {
        target: target.trim(),
        scan_type: scanType,
        modules: [...modules].filter((m) => allowedKeys.has(m)),
        port_config: portPreset === 'custom'
          ? { preset: 'custom', ports: customPorts.trim() }
          : { preset: portPreset },
      },
      {
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast.error(msg || 'Failed to create scan')
        },
      }
    )
  }

  const steps = ['Scan Type', 'Target', 'Modules', ...(showPortConfig ? ['Port Config'] : [])]

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={cn(
                'h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center',
                i + 1 < step ? 'bg-primary text-primary-foreground' :
                i + 1 === step ? 'border-2 border-primary text-primary' :
                'border border-border text-muted-foreground'
              )}>
                {i + 1}
              </div>
              <span className={cn('text-sm hidden sm:block', i + 1 === step ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                {label}
              </span>
              {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step 1 — Scan Type */}
        {step === 1 && (
          <div className="grid gap-3">
            {[
              { type: 'passive' as const, icon: Globe, label: 'Passive', desc: 'Discover assets without touching them. Input: domain or IP.' },
              { type: 'active' as const, icon: Zap, label: 'Active', desc: 'Fingerprint a single known target. Input: full URL or IP.' },
              { type: 'comprehensive' as const, icon: Layers, label: 'Comprehensive', desc: 'Discover all assets passively, then fingerprint each one actively.' },
            ].map(({ type, icon: Icon, label, desc }) => (
              <button
                key={type}
                onClick={() => setScanType(type)}
                className={cn(
                  'w-full text-left rounded-lg border p-4 transition-colors flex items-start gap-3',
                  scanType === type ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'
                )}
              >
                <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', scanType === type ? 'text-primary' : 'text-muted-foreground')} />
                <div>
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — Target */}
        {step === 2 && (
          <div className="space-y-3">
            <Label htmlFor="target">
              {scanType === 'active' ? 'Target URL or IP' : 'Target Domain or IP'}
            </Label>
            <Input
              id="target"
              placeholder={scanType === 'active' ? 'https://app.example.com' : 'example.com'}
              value={target}
              onChange={(e) => { setTarget(e.target.value); setTargetError('') }}
              onKeyDown={(e) => e.key === 'Enter' && goNext()}
              autoFocus
            />
            {targetError && <p className="text-xs text-destructive">{targetError}</p>}
            <p className="text-xs text-muted-foreground">
              {scanType === 'active'
                ? 'Accepts https://hostname:port/path or a bare IPv4 address.'
                : 'Accepts a bare domain (example.com) or IPv4 address.'}
            </p>
          </div>
        )}

        {/* Step 3 — Modules */}
        {step === 3 && (
          <div className="space-y-4">
            {visiblePassive.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passive modules</p>
                {visiblePassive.map(({ key, label, desc }) => (
                  <div key={key} className="flex items-start gap-3">
                    <Checkbox
                      id={key}
                      checked={modules.has(key)}
                      onCheckedChange={() => toggleModule(key)}
                    />
                    <div>
                      <Label htmlFor={key} className="cursor-pointer">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {visiblePassive.length > 0 && visibleActive.length > 0 && <Separator />}
            {visibleActive.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active modules</p>
                {visibleActive.map(({ key, label, desc, requiresTech }) => {
                  const disabled = requiresTech && !modules.has('tech_fingerprinting')
                  const item = (
                    <div key={key} className="flex items-start gap-3">
                      <Checkbox
                        id={key}
                        checked={modules.has(key)}
                        onCheckedChange={() => !disabled && toggleModule(key)}
                        disabled={disabled}
                      />
                      <div>
                        <Label htmlFor={key} className={cn('cursor-pointer', disabled && 'opacity-50')}>{label}</Label>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                  )
                  return disabled ? (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild><div>{item}</div></TooltipTrigger>
                      <TooltipContent>Requires Technology Fingerprinting</TooltipContent>
                    </Tooltip>
                  ) : item
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 4 — Port Config */}
        {step === 4 && showPortConfig && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the port range for nmap to scan.</p>
            <div className="flex flex-wrap gap-2">
              {PORT_PRESETS.map(({ key, label }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={portPreset === key ? 'default' : 'outline'}
                  onClick={() => setPortPreset(key)}
                  type="button"
                >
                  {label}
                </Button>
              ))}
            </div>
            {portPreset === 'custom' && (
              <div className="space-y-1.5">
                <Label htmlFor="ports">Port range</Label>
                <Input
                  id="ports"
                  placeholder="80,443,8080-8090"
                  value={customPorts}
                  onChange={(e) => { setCustomPorts(e.target.value); setPortsError('') }}
                />
                {portsError && <p className="text-xs text-destructive">{portsError}</p>}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => step === 1 ? onClose?.() : setStep((s) => s - 1)}
            disabled={createScan.isPending}
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button
            onClick={step === steps.length ? handleSubmit : goNext}
            disabled={createScan.isPending}
          >
            {createScan.isPending ? 'Launching…' : step === steps.length ? 'Launch Scan' : 'Next'}
            {step < steps.length && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Globe, Zap, ShieldAlert, ChevronRight, ChevronLeft, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCreateScan } from '@/hooks/useScans'
import { useSettings } from '@/hooks/useSettings'
import { cn } from '@/lib/utils'
import type { ScanType, StrixConfig } from '@/types'

type Mode = 'recon' | 'pentest'
type ReconSubType = 'passive' | 'active'
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

const STRIX_MODES = [
  { value: 'quick', label: 'Quick', desc: '~5 min, surface-level' },
  { value: 'standard', label: 'Standard', desc: '30–60 min, OWASP Top 10' },
  { value: 'deep', label: 'Deep', desc: '1–4 hrs, full enumeration' },
] as const

const urlRe = /^https?:\/\/.+/
const domainRe = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/
const portRangeRe = /^[\d,\-]+$/

function isValidReconTarget(target: string, subType: ReconSubType) {
  if (subType === 'active') return urlRe.test(target) || ipv4Re.test(target)
  return domainRe.test(target) || ipv4Re.test(target)
}

function isValidPentestTarget(target: string) {
  return domainRe.test(target) || urlRe.test(target) || ipv4Re.test(target)
}

export function NewScanForm({ onClose }: { onClose?: () => void }) {
  const createScan = useCreateScan()
  const { data: settings } = useSettings()

  // --- Mode ---
  const [mode, setMode] = useState<Mode>('recon')
  const [step, setStep] = useState(1)

  // --- Recon state ---
  const [reconSubType, setReconSubType] = useState<ReconSubType>('passive')
  const [target, setTarget] = useState('')
  const [targetError, setTargetError] = useState('')
  const [modules, setModules] = useState<Set<string>>(
    new Set(['dns_recon', 'ip_profiling', 'asset_identification', 'tech_fingerprinting', 'screenshot_capture', 'cve_detection', 'port_scan'])
  )
  const [portPreset, setPortPreset] = useState<PortPreset>('top1000')
  const [customPorts, setCustomPorts] = useState('')
  const [portsError, setPortsError] = useState('')

  // --- Pentest state ---
  const [pentestTarget, setPentestTarget] = useState('')
  const [pentestTargetError, setPentestTargetError] = useState('')
  const [strixMode, setStrixMode] = useState<'quick' | 'standard' | 'deep'>('standard')
  const [strixInstructions, setStrixInstructions] = useState('')
  const [strixBudget, setStrixBudget] = useState(String(settings?.strix_default_max_budget_usd ?? 10))

  // --- Step metadata ---
  const reconSteps = ['Mode', 'Recon Type', 'Target', 'Modules', ...(modules.has('port_scan') && reconSubType !== 'passive' ? ['Port Config'] : [])]
  const pentestSteps = ['Mode', 'Target', 'AI Config']
  const steps = mode === 'pentest' ? pentestSteps : reconSteps
  const totalSteps = steps.length

  // --- Helpers ---
  const scanType: ScanType = mode === 'pentest' ? 'pentest' : reconSubType

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

  const visiblePassive = reconSubType !== 'active' ? PASSIVE_MODULES : []
  const visibleActive = reconSubType !== 'passive' ? ACTIVE_MODULES : []
  const showPortConfig = modules.has('port_scan') && reconSubType !== 'passive'

  // --- Validation ---
  const validateReconTarget = () => {
    if (!target.trim()) { setTargetError('Target is required'); return false }
    if (!isValidReconTarget(target.trim(), reconSubType)) {
      setTargetError(
        reconSubType === 'active'
          ? 'Active recon requires a full URL (https://...) or IPv4 address'
          : 'Passive recon requires a domain name or IPv4 address'
      )
      return false
    }
    setTargetError('')
    return true
  }

  const validatePentestTarget = () => {
    if (!pentestTarget.trim()) { setPentestTargetError('Target is required'); return false }
    if (!isValidPentestTarget(pentestTarget.trim())) {
      setPentestTargetError('Enter a domain (example.com), URL (https://...), or IPv4 address')
      return false
    }
    setPentestTargetError('')
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

  // --- Navigation ---
  const goNext = () => {
    if (mode === 'pentest') {
      if (step === 2 && !validatePentestTarget()) return
      if (step === 3) { handleSubmitPentest(); return }
      setStep((s) => s + 1)
      return
    }

    // Recon
    if (step === 3 && !validateReconTarget()) return
    if (step === 4) {
      const activeCount = [...modules].filter((m) => ACTIVE_MODULES.some((a) => a.key === m)).length
      const passiveCount = [...modules].filter((m) => PASSIVE_MODULES.some((p) => p.key === m)).length
      if (reconSubType === 'passive' && passiveCount === 0) { toast.error('Select at least one passive module'); return }
      if (reconSubType === 'active' && activeCount === 0) { toast.error('Select at least one active module'); return }
      if (!showPortConfig) { handleSubmitRecon(); return }
    }
    if (step === 5) { handleSubmitRecon(); return }
    setStep((s) => s + 1)
  }

  const goBack = () => {
    if (step === 1) { onClose?.(); return }
    setStep((s) => s - 1)
  }

  const handleSubmitRecon = () => {
    if (!validatePorts()) return
    const allowedKeys = new Set([
      ...(reconSubType !== 'active' ? PASSIVE_MODULES.map((m) => m.key) : []),
      ...(reconSubType !== 'passive' ? ACTIVE_MODULES.map((m) => m.key) : []),
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
      { onError: _onError }
    )
  }

  const handleSubmitPentest = () => {
    const budget = parseFloat(strixBudget)
    if (isNaN(budget) || budget < 0.01 || budget > 100) {
      toast.error('Budget must be between $0.01 and $100.00')
      return
    }
    const strixConfig: StrixConfig = {
      scan_mode: strixMode,
      max_budget_usd: budget,
      ...(strixInstructions.trim() ? { instructions: strixInstructions.trim().slice(0, 500) } : {}),
    }
    createScan.mutate(
      {
        target: pentestTarget.trim(),
        scan_type: 'pentest',
        modules: [],
        port_config: { preset: 'top1000' },
        strix_config: strixConfig,
      },
      { onError: _onError }
    )
  }

  const _onError = (err: unknown) => {
    const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    toast.error(msg || 'Failed to create scan')
  }

  const isLastStep = step === totalSteps
  const submitLabel = mode === 'pentest' ? 'Launch AI Pentest' : 'Launch Recon'

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

        {/* Step 1 — Mode */}
        {step === 1 && (
          <div className="grid gap-3">
            <button
              onClick={() => setMode('recon')}
              className={cn(
                'w-full text-left rounded-lg border p-4 transition-colors flex items-start gap-3',
                mode === 'recon' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'
              )}
            >
              <Globe className={cn('h-5 w-5 mt-0.5 shrink-0', mode === 'recon' ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <div className="font-medium text-sm">Recon</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Non-destructive discovery and profiling. Choose Passive (DNS, subdomains, OSINT) or Active (fingerprinting, screenshots, CVEs, port scan).
                </div>
              </div>
            </button>
            <button
              onClick={() => setMode('pentest')}
              className={cn(
                'w-full text-left rounded-lg border p-4 transition-colors flex items-start gap-3',
                mode === 'pentest' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'
              )}
            >
              <ShieldAlert className={cn('h-5 w-5 mt-0.5 shrink-0', mode === 'pentest' ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <div className="font-medium text-sm">Comprehensive Security Test</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  AI-powered full pentest via Strix. OWASP Top 10, injection, auth bypass, logic flaws, and more. Requires LLM API key in Settings.
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step 2 (Recon) — Sub-type */}
        {step === 2 && mode === 'recon' && (
          <div className="grid gap-3">
            <TooltipProvider>
              {[
                {
                  type: 'passive' as const,
                  label: 'Passive Recon',
                  desc: 'Discovers DNS records, IP info, subdomains and dork hits without making direct contact with any target. Safe for any domain.',
                  tooltip: 'Uses: dnsrecon, ipinfo.io, subfinder, crt.sh, DuckDuckGo. No packets sent to the target.',
                },
                {
                  type: 'active' as const,
                  label: 'Active Recon',
                  desc: 'Connects directly to a single URL or IP: fingerprints the tech stack, captures screenshots, detects CVEs, and scans ports.',
                  tooltip: 'Uses: WhatWeb, GoWitness, nmap. Sends requests to the target — only run against systems you are authorised to test.',
                },
              ].map(({ type, label, desc, tooltip }) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setReconSubType(type)}
                      className={cn(
                        'w-full text-left rounded-lg border p-4 transition-colors flex items-start gap-3',
                        reconSubType === type ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/30'
                      )}
                    >
                      {type === 'passive'
                        ? <Globe className={cn('h-5 w-5 mt-0.5 shrink-0', reconSubType === type ? 'text-primary' : 'text-muted-foreground')} />
                        : <Zap className={cn('h-5 w-5 mt-0.5 shrink-0', reconSubType === type ? 'text-primary' : 'text-muted-foreground')} />
                      }
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{label}</span>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[240px] text-xs">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
          </div>
        )}

        {/* Step 2 (Pentest) / Step 3 (Recon) — Target */}
        {((mode === 'pentest' && step === 2) || (mode === 'recon' && step === 3)) && (
          <div className="space-y-3">
            {mode === 'pentest' ? (
              <>
                <Label htmlFor="pentest-target">Target</Label>
                <Input
                  id="pentest-target"
                  placeholder="example.com or https://app.example.com or 192.168.1.1"
                  value={pentestTarget}
                  onChange={(e) => { setPentestTarget(e.target.value); setPentestTargetError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && goNext()}
                  autoFocus
                />
                {pentestTargetError && <p className="text-xs text-destructive">{pentestTargetError}</p>}
                <p className="text-xs text-muted-foreground">Accepts a domain, full URL, or IPv4 address.</p>
              </>
            ) : (
              <>
                <Label htmlFor="target">
                  {reconSubType === 'active' ? 'Target URL or IP' : 'Target Domain or IP'}
                </Label>
                <Input
                  id="target"
                  placeholder={reconSubType === 'active' ? 'https://app.example.com' : 'example.com'}
                  value={target}
                  onChange={(e) => { setTarget(e.target.value); setTargetError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && goNext()}
                  autoFocus
                />
                {targetError && <p className="text-xs text-destructive">{targetError}</p>}
                <p className="text-xs text-muted-foreground">
                  {reconSubType === 'active'
                    ? 'Accepts https://hostname:port/path or a bare IPv4 address.'
                    : 'Accepts a bare domain (example.com) or IPv4 address.'}
                </p>
              </>
            )}
          </div>
        )}

        {/* Step 3 (Pentest) — AI Config */}
        {mode === 'pentest' && step === 3 && (
          <div className="space-y-4">
            {!settings?.llm_api_key_set && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
                No LLM API key configured.{' '}
                <Link to="/settings" className="underline font-medium">Visit Settings</Link>
                {' '}to add one before launching.
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Scan Mode</Label>
              <div className="flex gap-2">
                {STRIX_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setStrixMode(m.value)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-2 text-xs text-center transition-colors',
                      strixMode === m.value
                        ? 'border-primary bg-primary/5 text-foreground font-medium'
                        : 'border-border hover:border-primary/50 text-muted-foreground'
                    )}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="text-muted-foreground">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="strix-instructions" className="text-xs">
                Additional Instructions <span className="text-muted-foreground">(optional, max 500 chars)</span>
              </Label>
              <Textarea
                id="strix-instructions"
                placeholder="e.g. Focus on authentication bypass and IDOR vulnerabilities"
                value={strixInstructions}
                onChange={(e) => setStrixInstructions(e.target.value.slice(0, 500))}
                rows={3}
                className="text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{strixInstructions.length}/500</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="strix-budget" className="text-xs">Max Budget (USD)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  id="strix-budget"
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={strixBudget}
                  onChange={(e) => setStrixBudget(e.target.value)}
                  className="h-8 text-sm w-28"
                />
                <span className="text-xs text-muted-foreground">max $100.00</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 4 (Recon) — Modules */}
        {mode === 'recon' && step === 4 && (
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

        {/* Step 5 (Recon) — Port Config */}
        {mode === 'recon' && step === 5 && showPortConfig && (
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
            onClick={goBack}
            disabled={createScan.isPending}
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button
            onClick={isLastStep ? (mode === 'pentest' ? handleSubmitPentest : handleSubmitRecon) : goNext}
            disabled={createScan.isPending}
          >
            {createScan.isPending ? 'Launching…' : isLastStep ? submitLabel : 'Next'}
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}

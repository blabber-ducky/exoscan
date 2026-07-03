import { useEffect, useState } from 'react'
import { Settings, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useSettings, useUpdateSettings, useTestConnection } from '@/hooks/useSettings'
import { LLM_PROVIDERS } from '@/types'
import { cn } from '@/lib/utils'

const SCAN_MODES = [
  { value: 'quick', label: 'Quick', desc: '~5 min' },
  { value: 'standard', label: 'Standard', desc: '30–60 min' },
  { value: 'deep', label: 'Deep', desc: '1–4 hrs' },
] as const

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const update = useUpdateSettings()
  const testConn = useTestConnection()

  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyPlaceholder, setApiKeyPlaceholder] = useState('')
  const [perplexityKey, setPerplexityKey] = useState('')
  const [perplexityPlaceholder, setPerplexityPlaceholder] = useState('')
  const [telemetry, setTelemetry] = useState(false)
  const [scanMode, setScanMode] = useState<'quick' | 'standard' | 'deep'>('standard')
  const [budget, setBudget] = useState('10.00')
  const [showApiKey, setShowApiKey] = useState(false)
  const [showPerplexityKey, setShowPerplexityKey] = useState(false)

  useEffect(() => {
    if (!settings) return
    setProvider(settings.llm_provider)
    setModel(settings.llm_model)
    setApiKeyPlaceholder(settings.llm_api_key_masked ?? '')
    setPerplexityPlaceholder(settings.perplexity_api_key_masked ?? '')
    setTelemetry(settings.strix_telemetry)
    setScanMode(settings.strix_default_scan_mode)
    setBudget(settings.strix_default_max_budget_usd.toFixed(2))
  }, [settings])

  const currentProvider = LLM_PROVIDERS.find((p) => p.value === provider)

  const handleSave = () => {
    const req: Record<string, unknown> = {
      llm_provider: provider,
      llm_model: model,
      strix_telemetry: telemetry,
      strix_default_scan_mode: scanMode,
      strix_default_max_budget_usd: parseFloat(budget) || 10,
    }
    if (apiKey) req.llm_api_key = apiKey
    if (perplexityKey) req.perplexity_api_key = perplexityKey
    update.mutate(req as Parameters<typeof update.mutate>[0])
    setApiKey('')
    setPerplexityKey('')
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      {/* LLM Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">LLM Provider</CardTitle>
          <CardDescription className="text-xs">
            Used for AI Pentest (Comprehensive Security Test) via Strix. Your API key is encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider selector */}
          <div className="space-y-2">
            <Label className="text-xs">Provider</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LLM_PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { setProvider(p.value); setModel(p.placeholder) }}
                  className={cn(
                    'rounded-md border px-3 py-2 text-xs text-left transition-colors',
                    provider === p.value
                      ? 'border-primary bg-primary/5 text-foreground font-medium'
                      : 'border-border hover:border-primary/50 text-muted-foreground'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label htmlFor="model" className="text-xs">Model</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={currentProvider?.placeholder ?? 'model-name'}
              className="h-8 text-sm font-mono"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="api-key" className="text-xs">
              API Key
              {apiKeyPlaceholder && (
                <span className="ml-2 font-mono text-muted-foreground">{apiKeyPlaceholder}</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={apiKeyPlaceholder ? 'Enter new key to replace…' : 'sk-...'}
                className="h-8 text-sm font-mono pr-8"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Optional Perplexity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Perplexity API Key (Optional)</CardTitle>
          <CardDescription className="text-xs">
            Enables web OSINT search inside Strix AI Pentest runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="perplexity-key" className="text-xs">
              API Key
              {perplexityPlaceholder && (
                <span className="ml-2 font-mono text-muted-foreground">{perplexityPlaceholder}</span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="perplexity-key"
                type={showPerplexityKey ? 'text' : 'password'}
                value={perplexityKey}
                onChange={(e) => setPerplexityKey(e.target.value)}
                placeholder={perplexityPlaceholder ? 'Enter new key to replace…' : 'pplx-...'}
                className="h-8 text-sm font-mono pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPerplexityKey((v) => !v)}
                className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
              >
                {showPerplexityKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Pentest defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">AI Pentest Defaults</CardTitle>
          <CardDescription className="text-xs">
            Default settings for Comprehensive Security Test runs. Can be overridden per-scan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Default scan mode */}
          <div className="space-y-2">
            <Label className="text-xs">Default Scan Mode</Label>
            <div className="flex gap-2">
              {SCAN_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setScanMode(m.value)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-xs text-center transition-colors',
                    scanMode === m.value
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

          {/* Budget */}
          <div className="space-y-1.5">
            <Label htmlFor="budget" className="text-xs">Default Max Budget (USD)</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                id="budget"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="h-8 text-sm w-28"
              />
              <span className="text-xs text-muted-foreground">max $100.00</span>
            </div>
          </div>

          {/* Telemetry */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">Strix Telemetry</p>
              <p className="text-xs text-muted-foreground">Send anonymous usage data to Strix developers</p>
            </div>
            <button
              onClick={() => setTelemetry((v) => !v)}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                telemetry ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                  telemetry ? 'translate-x-4' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex gap-3">
        <Button
          onClick={handleSave}
          disabled={update.isPending}
        >
          {update.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save Settings'}
        </Button>
        <Button
          variant="outline"
          onClick={() => testConn.mutate()}
          disabled={testConn.isPending || !settings?.llm_api_key_set}
          title={!settings?.llm_api_key_set ? 'Save an API key first' : undefined}
        >
          {testConn.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Testing…</> : 'Test Connection'}
        </Button>
      </div>
    </div>
  )
}

export interface User {
  id: string
  email: string
  username: string
  is_admin: boolean
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface PortConfig {
  preset: 'top100' | 'top1000' | 'http_only' | 'custom'
  ports?: string
}

export interface UserSummary {
  id: string
  username: string
}

export interface GroupSummary {
  id: string
  name: string
  description?: string | null
}

export interface GroupMember {
  user_id: string
  username: string
  added_at: string
}

export interface Group {
  id: string
  name: string
  description?: string | null
  created_at: string
  members: GroupMember[]
}

export interface AdminUser {
  id: string
  username: string
  email: string
  is_admin: boolean
  is_active: boolean
  created_at: string
  groups: GroupSummary[]
}

export interface ScanShare {
  id: string
  shared_with_user: UserSummary | null
  shared_with_group: GroupSummary | null
  created_at: string
}

export type ScanStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type ScanType = 'passive' | 'active' | 'comprehensive' | 'pentest'

export const SCAN_TYPE_LABELS: Record<ScanType, string> = {
  passive: 'Passive Recon',
  active: 'Active Recon',
  comprehensive: 'Comprehensive Recon',
  pentest: 'Comprehensive Security Test',
}

export interface StrixConfig {
  scan_mode: 'quick' | 'standard' | 'deep'
  instructions?: string
  max_budget_usd: number
}

export interface PentestFinding {
  id: string
  scan_id: string
  title: string
  severity: 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  cvss_score: number | null
  cve_ids: string[]
  affected_endpoint: string | null
  description: string
  reproduction_steps: string | null
  patch_suggestion: string | null
  created_at: string
}

export interface PentestResults {
  scan: Scan
  findings: PentestFinding[]
}

export interface Scan {
  id: string
  target: string
  scan_type: ScanType
  modules: string[]
  port_config: PortConfig
  strix_config: StrixConfig | Record<string, never>
  status: ScanStatus
  completed_stages: string[]
  parent_scan_id: string | null
  dork_hits: DorkHit[]
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
  asset_count: number
  cve_count: number
  pentest_findings_count: number
  is_owner: boolean
  owner_username: string | null
}

export interface Technology {
  name: string
  version: string | null
  confidence: number | null
}

export interface OpenPort {
  port: number
  protocol: string
  state: string
  service: string
  version: string
}

export interface DnsRecord {
  type: string
  name?: string
  value?: string
  [key: string]: unknown
}

export interface DorkHit {
  query: string
  title: string
  url: string
  snippet: string
}

export interface CVE {
  id: string
  cve_id: string
  technology: string
  version: string | null
  cvss_score: number | null
  cvss_version: string | null
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null
  description: string | null
  nvd_url: string | null
}

export interface SuggestedScan {
  id: string
  scan_type: string
  display_name: string
  description: string | null
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  priority: number
  status: 'suggested' | 'running' | 'completed' | 'failed'
  result_summary: string | null
}

export interface ScanAsset {
  id: string
  url: string | null
  ip_address: string | null
  hostname: string | null
  status_code: number | null
  title: string | null
  screenshot_path: string | null
  technologies: Technology[]
  headers: Record<string, string>
  dns_records: DnsRecord[]
  waf_detected: string | null
  scan_status: 'live' | 'unreachable' | 'timeout' | 'filtered'
  scan_notes: string | null
  open_ports: OpenPort[]
  cves: CVE[]
  suggestions: SuggestedScan[]
  created_at: string
}

export interface ScanResults {
  scan: Scan
  assets: ScanAsset[]
}

export interface PagedScans {
  items: Scan[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface CreateScanPayload {
  target: string
  scan_type: ScanType
  modules: string[]
  port_config: PortConfig
  strix_config?: StrixConfig
  parent_scan_id?: string
}

export interface FollowupActivePayload {
  modules: string[]
  port_config: PortConfig
  asset_ids?: string[]
}

export interface FollowupActiveScanItem {
  id: string
  target: string
}

export interface FollowupActiveResult {
  created_scans: FollowupActiveScanItem[]
  skipped: number
}

export const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI', placeholder: 'gpt-4o' },
  { value: 'anthropic', label: 'Anthropic', placeholder: 'claude-sonnet-4-6' },
  { value: 'google', label: 'Google Vertex AI', placeholder: 'gemini-1.5-pro' },
  { value: 'aws_bedrock', label: 'AWS Bedrock', placeholder: 'anthropic.claude-3-5-sonnet-20241022-v2:0' },
  { value: 'azure', label: 'Azure OpenAI', placeholder: 'gpt-4o' },
  { value: 'openrouter', label: 'OpenRouter', placeholder: 'openai/gpt-4o' },
  { value: 'ollama', label: 'Ollama / Local', placeholder: 'llama3.1' },
] as const

export interface UserSettings {
  llm_provider: string
  llm_model: string
  llm_api_key_set: boolean
  llm_api_key_masked: string | null
  perplexity_api_key_set: boolean
  perplexity_api_key_masked: string | null
  strix_telemetry: boolean
  strix_default_scan_mode: 'quick' | 'standard' | 'deep'
  strix_default_max_budget_usd: number
  ollama_base_url: string | null
  updated_at: string
}

export interface UserSettingsRequest {
  llm_provider?: string
  llm_model?: string
  llm_api_key?: string
  perplexity_api_key?: string
  strix_telemetry?: boolean
  strix_default_scan_mode?: 'quick' | 'standard' | 'deep'
  strix_default_max_budget_usd?: number
  ollama_base_url?: string | null
}

export interface TestConnectionResult {
  ok: boolean
  error: string | null
}

export interface WsLogLine {
  type: 'log' | 'complete' | 'error' | 'ping'
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  stage?: string
  message?: string
  timestamp?: string
  status?: string
}

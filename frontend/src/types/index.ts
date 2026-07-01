export interface User {
  id: string
  email: string
  username: string
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

export interface Scan {
  id: string
  target: string
  scan_type: 'passive' | 'active' | 'comprehensive'
  modules: string[]
  port_config: PortConfig
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  dork_hits: DorkHit[]
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
  asset_count: number
  cve_count: number
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
  scan_type: 'passive' | 'active' | 'comprehensive'
  modules: string[]
  port_config: PortConfig
}

export interface WsLogLine {
  type: 'log' | 'complete' | 'error' | 'ping'
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  stage?: string
  message?: string
  timestamp?: string
  status?: string
}

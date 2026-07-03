# Exoscan — User Guide

## What Is Exoscan?

Exoscan is an external reconnaissance and AI-powered security testing platform for security professionals. You give it a domain or IP address, choose a mode, and it does the work:

- **Recon** — Discovers subdomains, DNS records, open ports, server technologies, and known CVEs, and presents everything in one place with actionable follow-up suggestions.
- **Comprehensive Security Test** — Runs an AI-powered full pentest via Strix, autonomously discovering and validating vulnerabilities (OWASP Top 10, injection, auth bypass, business logic flaws, and more) and reporting them with CVSS scores, reproduction steps, and patch suggestions.

All scanning tools run inside ephemeral Docker containers that are destroyed immediately after each run. Results are stored in the database so you can return to them later.

**Intended use:** Only scan infrastructure you own or have written permission to test.

---

## Choosing a Mode

When you click **New Scan**, the first step is choosing between two modes:

### Recon

Non-destructive discovery and profiling of a target. You then choose a sub-type:

**Passive Recon**
- Input: a main domain (e.g. `example.com`) or IP address
- Collects information without sending probes directly to the target's servers — everything comes from DNS resolvers, certificate transparency logs, and public search indexes
- Good for: initial reconnaissance before an engagement, broad discovery of what belongs to a domain, low-noise profiling

**Active Recon**
- Input: a specific URL (e.g. `https://app.example.com`) or IP address
- Sends requests directly to the target: port probes, HTTP requests for fingerprinting, visual screenshots
- Good for: deep inspection of a single known endpoint, technology stack identification, CVE correlation

Both sub-types show description tooltips on the selection cards so you can make an informed choice.

### Comprehensive Security Test

- Input: a domain, URL, or IP address
- Runs a fully automated AI pentest via [Strix](https://github.com/usestrix/strix)
- Requires an LLM API key configured in **Settings** — the AI model drives the entire test autonomously
- Does not build on prior recon data — Strix always starts fresh against the target
- Good for: thorough automated security assessment, finding logic flaws and authentication issues that simple scanners miss

**Requires:** Before launching, visit **Settings** (gear icon in the navbar) and add your LLM API key.

---

## Settings

The Settings page (`/settings`) lets you configure your LLM provider for use with Comprehensive Security Test. Accessible via the Settings link in the top navigation bar.

### LLM Provider

| Field | Description |
|-------|-------------|
| **Provider** | Your LLM service: OpenAI, Anthropic, Google Vertex AI, AWS Bedrock, Azure OpenAI, OpenRouter, or Ollama/Local |
| **Model** | Any model name accepted by the provider (e.g. `gpt-4o`, `claude-sonnet-4-6`) |
| **API Key** | Your provider API key — stored encrypted at rest, shown masked (`sk-...****`) once saved. Re-enter to replace. |

### Perplexity API Key (Optional)

If configured, Strix will use Perplexity to perform web OSINT searches as part of its reconnaissance. Enter your Perplexity API key here.

### AI Pentest Defaults

These pre-fill the per-scan config when you launch a Comprehensive Security Test. You can override them each time.

| Setting | Description |
|---------|-------------|
| **Default Scan Mode** | Quick (~5 min) / Standard (30–60 min) / Deep (1–4 hrs). Controls how deeply Strix explores the target. |
| **Default Max Budget** | Maximum USD to spend on LLM API calls per run. Must be between $0.01 and $100.00. Enforced server-side. |
| **Strix Telemetry** | Whether to send anonymous usage data to the Strix developers. Off by default. |

Click **Test Connection** to validate your API key before launching a pentest.

---

## Recon Modules

### Passive Modules

| Module | What it does |
|--------|-------------|
| **DNS Recon** | Queries DNS for A, AAAA, MX, NS, TXT, CNAME, and SOA records. Uses `dnsrecon` inside a Kali container. |
| **IP Profiling** | Looks up the IP address in ipinfo.io to get ASN, organisation, country, city, and reverse DNS. |
| **Asset Identification** | Discovers subdomains via `subfinder` (passive DNS aggregation), certificate transparency logs (crt.sh), and DuckDuckGo dorking. |

### Active Modules

| Module | What it does |
|--------|-------------|
| **Technology Fingerprinting** | Runs `whatweb` against the target URL to identify software, frameworks, CMS platforms, server headers, and version strings. |
| **Screenshot Capture** | Uses `gowitness` to take a headless-browser screenshot of each live asset. |
| **CVE Detection** | Requires Technology Fingerprinting. Looks up each detected technology + version in the NVD database (NIST) and correlates known CVEs with CVSS scores. Results cached 24 hours. |
| **Port & Service Scan** | Runs `nmap -sV` to identify open TCP ports and service versions. Port range is configurable. |

**CVE Detection dependency:** CVE Detection requires Technology Fingerprinting. The wizard enforces this automatically — selecting CVE Detection adds Fingerprinting; deselecting Fingerprinting removes CVE Detection.

---

## Port & Service Scan Configuration

When you select the Port & Service Scan module, a configuration step appears with four presets:

| Preset | Ports scanned | Use when |
|--------|--------------|----------|
| **Top 100** | nmap's 100 most common ports | Quick check, minimal noise |
| **Top 1000** | nmap's 1000 most common ports (default) | Standard engagement |
| **HTTP/S Only** | 80, 443, 8080, 8443 | Web-only targets |
| **Custom** | Your list | Specific requirements |

Custom port syntax: comma-separated ports and ranges, e.g. `22,80,443,8080-8090`. All values must be integers between 1 and 65535; ranges must have start ≤ end.

---

## Comprehensive Security Test Configuration

When you select Comprehensive Security Test, you configure:

| Field | Description |
|-------|-------------|
| **Target** | Domain, full URL, or IPv4 address |
| **Scan Mode** | Quick / Standard / Deep — controls how deeply Strix explores the target |
| **Additional Instructions** | Optional guidance for the AI (max 500 chars), e.g. "Focus on authentication bypass and IDOR" |
| **Max Budget** | Per-run USD cap for LLM API usage (max $100) |

If your LLM API key is not configured, a warning banner appears with a link to Settings.

---

## Scan Progress Page

While a scan is running you can watch two things:

- **Stage stepper** — shows which stages are done, running, or pending
  - Recon stages: Passive → Liveness Probe → Active → Suggestions
  - AI Pentest stages: Preparing → AI Pentest → Parsing Findings
- **Live log stream** — raw output from the orchestrator and tool containers, streamed over WebSocket. Log lines are colour-coded: INFO white, WARN yellow, ERROR red. If you close the tab and return, the log history is replayed from the database.

When the scan completes, the page automatically redirects to the results page after 1.5 seconds.

You can also **pause**, **resume**, or **cancel** a running scan using the control buttons on the Scan page (owner only).

---

## Results Page — Recon

### Passive Recon Panel

Three tabs show passive-phase output:

- **DNS** — all DNS records found for the main target.
- **Subdomains** — every hostname discovered by `subfinder`, crt.sh, and dorking.
- **Dork Hits** — DuckDuckGo search results from structured queries. Useful for finding exposed login pages, admin panels, and indexed sensitive paths.

### Asset Grid

Each live asset gets a card showing:

- **Screenshot** (if captured) — click to open full size
- **HTTP status code** and page title
- **WAF badge** — shown in orange if a web application firewall was detected
- **Technology badges** — up to six; overflow count links to the full list
- **Scan status banner** — assets that were unreachable, timed out, or filtered show a status banner; they were skipped by active modules but still appear in results

Expanding an asset card reveals three tabs:

| Tab | Contents |
|-----|----------|
| **Ports** | Table of open ports, protocol, service name, and version string from nmap |
| **CVEs** | CVEs correlated with detected technologies — CVSS score, severity, description, NVD link |
| **Suggested** | Follow-up scan suggestions per-asset. Click **Run** to execute one. |

### Active Recon Follow-up

After a completed Passive Recon, the **Active Recon Assets** button appears (owner only). This opens a dialog to select which discovered assets to run active recon against, with module and port configuration — without re-running passive discovery.

---

## Results Page — Comprehensive Security Test

The results page shows a **Pentest Findings** panel with:

- **Finding count** header
- **Severity filter chips** — filter by Critical / High / Medium / Low / Informational
- **Finding cards**, one per vulnerability, each showing:
  - **Severity badge** — colour-coded (red = Critical, orange = High, yellow = Medium, blue = Low, grey = Informational)
  - **Title** and CVSS score
  - **Affected endpoint** (if identified)
  - **Description**
  - **Reproduction Steps** — expandable section
  - **Patch Suggestion** — expandable section
  - **CVE IDs** (if correlated)

---

## Secondary Scan Suggestions

After active recon, Exoscan generates targeted follow-up scan suggestions for each asset based on detected technologies and CVE severity. Suggestions are scored 0–100 and sorted by priority.

| Risk Level | Meaning |
|-----------|---------|
| HIGH | Targets a known-dangerous technology or confirmed high-severity CVE path |
| MEDIUM | Moderately risky — worth running but less urgent |
| LOW | Supplementary (content discovery, brute-force paths) |

---

## Asset Scan Statuses

| Status | Meaning |
|--------|---------|
| `live` | The asset responded within the probe timeout. Active modules ran. |
| `unreachable` | No response. No active modules ran. |
| `timeout` | Asset responded too slowly. No active modules ran. |
| `filtered` | Traffic appears to be dropped by a firewall/ACL. |

---

## Sharing Scan Results

Completed scans can be shared with other registered users, individually or through groups.

### Sharing a Scan

Click the **Share** icon on any completed scan card. The share dialog has two tabs:

**Groups tab** — lists every group you are a member of. Click **Share** to grant all group members read access. You can only share with groups you belong to.

**Users tab** — search for any registered username and share directly with that user.

### Viewing Shared Scans

Scans shared with you appear in your dashboard. Shared scans show the owner's username. You can view the scan page and results, and replay the log stream, but you cannot delete, re-share, or trigger follow-up scans.

### Revoking Access

Open the share dialog for any of your scans. The current share list shows each active share with a revoke button.

---

## Admin Panel

Administrators have access to a dedicated panel at `/admin` (the **Admin** link in the navbar, visible only to admins).

### Becoming an Admin

Admin access is controlled by the `ADMIN_EMAIL` environment variable set by whoever operates the Exoscan instance. The account registered with that email is automatically promoted to admin on their first login.

### Groups

The **Groups** tab lets you create and manage groups for scan sharing.

**Creating a group:** Enter a name (must be unique) and an optional description. Click **Create**.

**Managing members:** Click any group row to expand it. Use the search box to find users to add.

**Deleting a group** removes all memberships and all scan shares that targeted it.

### Users

The **Users** tab shows all registered accounts with their email, admin/disabled status, and group memberships.

---

## Limitations

- **Rate limiting:** DuckDuckGo dorking is throttled to 1 request per 3 seconds.
- **CVE coverage:** Results depend on how accurately `whatweb` identifies software versions; unrecognised version strings may produce no CVE matches.
- **Screenshot reliability:** Pages requiring CAPTCHA, heavy JavaScript auth, or client certificates may screenshot blank or error pages.
- **Container cold start:** The first scan after a Docker image pull can be slow (100–200 MB Kali image). Subsequent scans are fast due to Docker image caching.
- **AI Pentest duration:** Quick mode takes ~5 minutes; Standard 30–60 minutes; Deep 1–4 hours. There is a server-side 2-hour hard cap — very large targets on Deep mode may be cut short.
- **AI Pentest cost:** LLM API usage is billed by your provider. Set a conservative `Max Budget` limit and review costs after your first few runs.
- **AI Pentest accuracy:** Strix is automated but not infallible. Results should be validated manually before reporting. False positives are possible.
- **Not a substitute for manual testing.** Automated tooling surfaces the obvious. Use Exoscan results as a starting point, not a final verdict.

---

## Responsible Use

Exoscan is a tool for authorised security testing. Running active scans or AI pentests against systems you do not own or have explicit written permission to test is illegal in most jurisdictions and unethical in all of them.

Use it to:
- Audit your own infrastructure
- Test client systems during a contracted engagement
- Practice on deliberately vulnerable lab environments

Do not use it to:
- Scan third-party infrastructure without permission
- Enumerate competitors or collect intelligence on targets you don't control
- Automate large-scale, indiscriminate scanning

# Exoscan — User Guide

## What Is Exoscan?

Exoscan is an external reconnaissance platform for security professionals. You give it a domain or IP address, choose which techniques to run, and it collects publicly observable information about that target — DNS records, subdomains, open ports, server technologies, known CVEs — and presents everything in one place with actionable follow-up suggestions.

All scanning tools run inside ephemeral Docker containers that are destroyed immediately after each stage completes. Results are stored in the database so you can return to them later.

**Intended use:** Only scan infrastructure you own or have written permission to test.

---

## Scan Types

### Passive

Input: a **main domain** (e.g. `example.com`) or IP address.

Collects information without sending probes directly to the target's servers. Everything comes from DNS resolvers, certificate transparency logs, and public search indexes.

Good for: initial reconnaissance before an engagement, broad discovery of what belongs to a domain, low-noise profiling.

### Active

Input: a **specific URL** (e.g. `https://app.example.com`) or IP address.

Sends requests directly to the target: port probes, HTTP requests for fingerprinting, visual screenshots. Leaves traces in the target's logs.

Good for: deep inspection of a single known endpoint, technology stack identification, CVE correlation.

### Comprehensive

Input: a **main domain** or IP address.

Runs passive discovery first to find all subdomains/assets, then runs active modules against every discovered asset automatically. The most thorough option, and the one that generates the most traffic to the target.

Good for: a full external attack-surface audit.

---

## Modules

### Passive Modules

| Module | What it does |
|--------|-------------|
| **DNS Recon** | Queries DNS for A, AAAA, MX, NS, TXT, CNAME, and SOA records. Uses `dnsrecon` inside a Kali container. Results appear in the DNS tab on the results page. |
| **IP Profiling** | Looks up the IP address in ipinfo.io to get ASN, organisation, country, city, and reverse DNS. Runs in-process (no container). |
| **Asset Identification** | Discovers subdomains via three sources: `subfinder` (passive DNS aggregation), certificate transparency logs (crt.sh), and DuckDuckGo dorking. Each discovered hostname is probed for liveness; live ones become assets in the results. |

### Active Modules

| Module | What it does |
|--------|-------------|
| **Technology Fingerprinting** | Runs `whatweb` against the target URL to identify software, frameworks, CMS platforms, server headers, and version strings. |
| **Screenshot Capture** | Uses `gowitness` to take a headless-browser screenshot of each live asset. Screenshots are displayed in the results card for that asset. |
| **CVE Detection** | Requires Technology Fingerprinting. Looks up each detected technology + version in the NVD database (NIST) and correlates known CVEs with CVSS scores. Results are cached for 24 hours. |
| **Port & Service Scan** | Runs `nmap -sV` to identify open TCP ports and the services/versions running on them. The port range is configurable (see below). |

### CVE Detection dependency

CVE Detection requires knowing which software versions are running, so it always runs after Technology Fingerprinting. If you select CVE Detection without Technology Fingerprinting, the wizard will automatically enable Fingerprinting. If you later deselect Fingerprinting, CVE Detection will be automatically deselected too.

---

## Port & Service Scan Configuration

When you select the Port & Service Scan module, a configuration step appears with four presets:

| Preset | Ports scanned | Use when |
|--------|--------------|----------|
| **Top 100** | nmap's 100 most common ports | Quick check, minimal noise |
| **Top 1000** | nmap's 1000 most common ports (default) | Standard engagement |
| **HTTP/S Only** | 80, 443, 8080, 8443 | Web-only targets |
| **Custom** | Your list | Specific requirements |

Custom port syntax: comma-separated ports and ranges, e.g. `22,80,443,8080-8090`. All values must be integers between 1 and 65535; ranges must have the start ≤ end.

---

## Reading Results

### Scan Progress Page

While a scan is running you can watch two things:

- **Stage stepper** — shows which of the four stages (Passive, Probe, Active, Suggestions) is currently running, and which are done or pending.
- **Live log stream** — raw output from the orchestrator and all tool containers, streamed over WebSocket. Log lines are colour-coded: INFO is white, WARN is yellow, ERROR is red. If you close the tab and come back, the log history is replayed from the database.

When the scan completes, the page automatically redirects to the results page after 1.5 seconds.

### Results Page — Passive Recon Panel

Three tabs across the top of the results page show passive-phase output:

- **DNS** — all DNS records found for the main target.
- **Subdomains** — every hostname discovered by `subfinder`, crt.sh, and dorking, with source tags.
- **Dork Hits** — DuckDuckGo search results from structured queries against the domain. Useful for finding exposed login pages, admin panels, and indexed sensitive paths.

### Results Page — Asset Grid

Each live asset gets a card showing:

- **Screenshot** (if screenshot capture was enabled) — click to open full size.
- **HTTP status code** and page title.
- **WAF badge** — shown in orange if a web application firewall was detected.
- **Technology badges** — up to six technologies; if more were found, an overflow count links to the full list.
- **Scan status banner** — assets that were unreachable, timed out, or had filtered ports show a yellow/red banner explaining the status. They still appear in results; they were just skipped by active modules.

Expanding an asset card reveals three tabs:

| Tab | Contents |
|-----|----------|
| **Ports** | Table of open ports, protocol, service name, and version string from nmap. |
| **CVEs** | List of CVEs correlated with detected technologies, each with CVSS score, severity badge, description, and link to the NVD entry. |
| **Suggested** | Follow-up scan suggestions generated based on discovered technologies and CVE severity. See below. |

### Suggested Scans

After active recon, Exoscan generates targeted follow-up scan suggestions for each asset. Suggestions are scored 0–100 and sorted by priority. Priority is boosted by 40 points when the asset has at least one CVE with CVSS ≥ 7.0 (high or critical severity).

| Risk Level | Meaning |
|-----------|---------|
| HIGH | The suggested scan targets a known-dangerous technology or a confirmed high-severity CVE path |
| MEDIUM | Moderately risky — worth running but less urgent |
| LOW | Supplementary (content discovery, brute-force paths) |

To run a suggested scan, click the **Run** button on the suggestion card. The scan executes in a new ephemeral container, streams output in the log viewer, and stores a result summary when it finishes.

---

## Asset Scan Statuses

| Status | Meaning |
|--------|---------|
| `live` | The asset responded within the probe timeout. Active modules ran against it. |
| `unreachable` | No response at all from the asset. No active modules ran. |
| `timeout` | The asset responded too slowly and the probe timed out. No active modules ran. |
| `filtered` | The asset appears to be behind a firewall or ACL that dropped all probes. |

---

## Sharing Scan Results

Completed scans can be shared with other registered users, either individually or through groups.

### Sharing a Scan

Click the **Share** icon on any completed scan card in your dashboard. The share dialog has two tabs:

**Groups tab** — lists every group you are a member of. Click **Share** to grant all current (and future) members of that group read access to your scan. The button changes to **Shared** once active. You can only share with groups you belong to; groups you are not a member of do not appear here.

**Users tab** — search for any registered username. Click **Share** next to a result to grant that specific user access.

### Viewing Shared Scans

Scans shared with you appear in your dashboard alongside your own scans. Shared scans show the owner's username next to the scan status. You can:

- View the scan page and results in full
- Watch the live log stream (or replay history)

You cannot delete, re-share, or trigger suggested scans on a scan you do not own.

### Revoking Access

Open the share dialog for any of your scans. The current share list at the top of the dialog shows each active share with a revoke button. Removing a user or group share immediately removes their access.

Deleting a group (admin action) also removes any scan shares that targeted it.

---

## Admin Panel

Administrators have access to a dedicated panel at `/admin` (the **Admin** link in the navigation bar, visible only to admins).

### Becoming an Admin

Admin access is controlled by the `ADMIN_EMAIL` environment variable set by whoever operates the Exoscan instance. The account registered with that email address is automatically promoted to admin on their first login. Contact your instance operator if you need admin access.

### Groups

The **Groups** tab lets you create and manage groups, which are the primary way to share scans with multiple users at once.

**Creating a group:**
1. Enter a group name (must be unique across the instance) and an optional description.
2. Click **Create**.

**Managing members:**
- Click any group row to expand it.
- The member list shows current members with a remove button next to each name.
- Use the search box to find users to add. Only users not already in the group appear in the results. Click **Add** to add them.

**Deleting a group** removes all memberships and all scan shares that targeted it. Users who had access only through that group immediately lose access to the shared scans.

### Users

The **Users** tab shows all registered accounts with their email address, admin/disabled status, and current group memberships.

---

## Limitations

- **Rate limiting:** DuckDuckGo dorking is throttled to 1 request per 3 seconds to avoid being blocked.
- **CVE coverage:** CVE data comes from the NVD (NIST) API. Results depend on how accurately `whatweb` identifies software versions; unrecognised version strings may produce no CVE matches.
- **Screenshot reliability:** GoWitness uses a headless browser. Pages that require JavaScript-heavy login flows, CAPTCHA, or client certificates will screenshot a blank or error page.
- **Container cold start:** The first scan after a Docker image pull can be slow (100–200 MB Kali image download). Subsequent scans are fast because Docker caches the image.
- **Nuclei templates:** The Nuclei CVE template set is updated every 24 hours automatically on backend startup. New CVE templates published after the last update won't appear in suggested scan results until the next update cycle.
- **Not a substitute for manual testing.** Automated recon surfaces the obvious; skilled adversaries hide in the details. Use Exoscan results as a starting point, not a final verdict.

---

## Responsible Use

Exoscan is a tool for authorised security testing. Running active scans against systems you do not own or have explicit written permission to test is illegal in most jurisdictions and unethical in all of them. The tool does not impose any technical barrier against misuse — that responsibility is yours.

Use it to:
- Audit your own infrastructure
- Test client systems during a contracted engagement
- Practice on deliberately vulnerable lab environments

Do not use it to:
- Scan third-party infrastructure without permission
- Enumerate competitors or collect intelligence on targets you don't control
- Automate large-scale, indiscriminate scanning

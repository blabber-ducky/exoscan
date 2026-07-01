"""
Secondary scan template registry.

SCAN_TEMPLATES maps normalised technology keys to ordered lists of ScanTemplate
objects. Matching is done by substring: a template fires when its key appears as
a substring of any detected technology name (case-insensitive).

The special key "_default" holds templates applied to every asset with a URL,
regardless of which technologies were detected.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class ScanTemplate:
    scan_type: str       # dispatch key used by executor.py
    display_name: str
    description: str
    risk_level: str      # LOW | MEDIUM | HIGH
    base_priority: int   # 0–100; boosted +40 in suggestions.py when CVSS ≥ 7.0


SCAN_TEMPLATES: dict[str, list[ScanTemplate]] = {
    "wordpress": [
        ScanTemplate(
            scan_type="wpscan",
            display_name="WPScan",
            description="WordPress vulnerability scanner — checks plugins, themes, and users for known CVEs",
            risk_level="HIGH",
            base_priority=80,
        ),
        ScanTemplate(
            scan_type="nuclei_cve",
            display_name="Nuclei CVE (WordPress)",
            description="Nuclei template scan scoped to known WordPress CVEs",
            risk_level="HIGH",
            base_priority=75,
        ),
    ],
    "apache": [
        ScanTemplate(
            scan_type="nuclei_cve",
            display_name="Nuclei CVE (Apache)",
            description="Nuclei template scan scoped to known Apache HTTP Server CVEs",
            risk_level="MEDIUM",
            base_priority=60,
        ),
        ScanTemplate(
            scan_type="nikto",
            display_name="Nikto Web Scan",
            description="Web server misconfiguration and vulnerability scanner",
            risk_level="MEDIUM",
            base_priority=50,
        ),
        ScanTemplate(
            scan_type="ffuf_content",
            display_name="Content Discovery (ffuf)",
            description="Fuzz common paths to discover hidden files, admin panels, and backup files",
            risk_level="LOW",
            base_priority=30,
        ),
    ],
    "nginx": [
        ScanTemplate(
            scan_type="nuclei_cve",
            display_name="Nuclei CVE (Nginx)",
            description="Nuclei template scan scoped to known Nginx CVEs",
            risk_level="MEDIUM",
            base_priority=60,
        ),
        ScanTemplate(
            scan_type="ffuf_content",
            display_name="Content Discovery (ffuf)",
            description="Fuzz common paths to discover hidden files, admin panels, and backup files",
            risk_level="LOW",
            base_priority=30,
        ),
    ],
    "tomcat": [
        ScanTemplate(
            scan_type="nuclei_cve",
            display_name="Nuclei CVE (Tomcat)",
            description="Nuclei template scan scoped to known Apache Tomcat CVEs",
            risk_level="HIGH",
            base_priority=75,
        ),
        ScanTemplate(
            scan_type="nmap_vuln",
            display_name="Nmap Vuln Scripts",
            description="Nmap vulnerability detection scripts against open service ports",
            risk_level="MEDIUM",
            base_priority=50,
        ),
    ],
    "jenkins": [
        ScanTemplate(
            scan_type="nuclei_cve",
            display_name="Nuclei CVE (Jenkins)",
            description="Nuclei template scan scoped to known Jenkins CVEs",
            risk_level="HIGH",
            base_priority=80,
        ),
        ScanTemplate(
            scan_type="nmap_vuln",
            display_name="Nmap Vuln Scripts",
            description="Nmap vulnerability detection scripts against open service ports",
            risk_level="HIGH",
            base_priority=65,
        ),
    ],
    "php": [
        ScanTemplate(
            scan_type="nuclei_cve",
            display_name="Nuclei CVE (PHP)",
            description="Nuclei template scan scoped to known PHP CVEs",
            risk_level="MEDIUM",
            base_priority=55,
        ),
    ],
    "_default": [
        ScanTemplate(
            scan_type="nikto",
            display_name="Nikto Web Scan",
            description="Web server misconfiguration and vulnerability scanner",
            risk_level="MEDIUM",
            base_priority=45,
        ),
        ScanTemplate(
            scan_type="ffuf_content",
            display_name="Content Discovery (ffuf)",
            description="Fuzz common paths to discover hidden files, admin panels, and backup files",
            risk_level="LOW",
            base_priority=30,
        ),
    ],
}

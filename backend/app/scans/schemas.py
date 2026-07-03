import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Any

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

# --- Module registry ---

PASSIVE_MODULES = {"dns_recon", "ip_profiling", "asset_identification"}
ACTIVE_MODULES = {"tech_fingerprinting", "screenshot_capture", "cve_detection", "port_scan"}

_ALLOWED_BY_TYPE = {
    "passive": PASSIVE_MODULES,
    "active": ACTIVE_MODULES,
    "comprehensive": PASSIVE_MODULES | ACTIVE_MODULES,
    "pentest": set(),  # Strix manages its own toolchain; no modules
}

# --- Target validation helpers ---

_DOMAIN_RE = re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
)
_URL_RE = re.compile(r"^https?://[^\s]+$")
_PORT_RANGE_RE = re.compile(r"^[\d,\-]+$")


def _is_ipv4(s: str) -> bool:
    parts = s.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except ValueError:
        return False


def _is_domain(s: str) -> bool:
    return bool(_DOMAIN_RE.match(s))


def _is_url(s: str) -> bool:
    return bool(_URL_RE.match(s))


def _valid_port_ranges(ports_str: str) -> bool:
    """Confirm every port/range token is within 1–65535 and ranges have start ≤ end."""
    for token in ports_str.split(","):
        token = token.strip()
        if not token:
            return False
        if "-" in token:
            parts = token.split("-", 1)
            try:
                lo, hi = int(parts[0]), int(parts[1])
            except ValueError:
                return False
            if not (1 <= lo <= 65535 and 1 <= hi <= 65535 and lo <= hi):
                return False
        else:
            try:
                p = int(token)
            except ValueError:
                return False
            if not 1 <= p <= 65535:
                return False
    return True


# --- Strix config (pentest scan type) ---

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")


class StrixConfig(BaseModel):
    scan_mode: Literal["quick", "standard", "deep"] = "standard"
    instructions: str | None = None
    max_budget_usd: float = 10.0

    @model_validator(mode="after")
    def _validate(self) -> "StrixConfig":
        if not (0.01 <= self.max_budget_usd <= 100.0):
            raise ValueError("max_budget_usd must be between 0.01 and 100.00")
        if self.instructions is not None:
            cleaned = _CONTROL_CHAR_RE.sub(" ", self.instructions).strip()[:500]
            self.instructions = cleaned or None
        return self


# --- Nested config ---

class PortConfig(BaseModel):
    preset: Literal["top100", "top1000", "http_only", "custom"] = "top1000"
    ports: str | None = None

    @model_validator(mode="after")
    def _ports_required_for_custom(self) -> "PortConfig":
        if self.preset == "custom":
            if not self.ports:
                raise ValueError("ports is required when preset is custom")
            if not _PORT_RANGE_RE.match(self.ports):
                raise ValueError(
                    "ports must be comma-separated numbers or ranges, e.g. 80,443,8080-8090"
                )
            if not _valid_port_ranges(self.ports):
                raise ValueError(
                    "all port numbers must be in range 1–65535; ranges must have start ≤ end"
                )
        return self


# --- Request schemas ---

class CreateScanRequest(BaseModel):
    target: str
    scan_type: Literal["passive", "active", "comprehensive", "pentest"]
    modules: list[str] = []
    port_config: PortConfig = PortConfig()
    strix_config: StrixConfig | None = None
    parent_scan_id: str | None = None

    @field_validator("target")
    @classmethod
    def _strip_target(cls, v: str) -> str:
        return v.strip().rstrip("/")

    @model_validator(mode="after")
    def _validate_target_and_modules(self) -> "CreateScanRequest":
        if self.scan_type == "pentest":
            # Pentest accepts domain, URL, or IPv4
            if not (_is_domain(self.target) or _is_url(self.target) or _is_ipv4(self.target)):
                raise ValueError(
                    "AI Pentest requires a domain (example.com), URL (https://...), or IPv4 address"
                )
            if self.modules:
                raise ValueError(
                    "AI Pentest does not accept modules — Strix determines its own approach"
                )
            return self

        # Validate target format for recon scan types
        if self.scan_type == "active":
            if not (_is_url(self.target) or _is_ipv4(self.target)):
                raise ValueError(
                    "Active recon requires a full URL (https://...) or an IPv4 address"
                )
        else:
            if not (_is_domain(self.target) or _is_ipv4(self.target)):
                raise ValueError(
                    "Passive/comprehensive recon requires a domain name or IPv4 address"
                )

        # Validate modules are non-empty and valid for scan type
        if not self.modules:
            raise ValueError("At least one module must be selected")

        allowed = _ALLOWED_BY_TYPE[self.scan_type]
        invalid = set(self.modules) - allowed
        if invalid:
            raise ValueError(
                f"Module(s) not valid for {self.scan_type} recon: {', '.join(sorted(invalid))}"
            )

        # cve_detection requires tech_fingerprinting
        if "cve_detection" in self.modules and "tech_fingerprinting" not in self.modules:
            raise ValueError("cve_detection requires tech_fingerprinting to also be selected")

        return self


# --- Response schemas ---

class TechnologySchema(BaseModel):
    name: str
    version: str | None = None
    category: str | None = None
    confidence: int | None = None


class CVESchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    cve_id: str
    technology: str
    version: str | None
    cvss_score: float | None
    cvss_version: str | None
    severity: str | None
    description: str | None
    nvd_url: str | None


class SuggestedScanSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scan_type: str
    display_name: str
    description: str | None
    risk_level: str
    priority: int
    status: str
    result_summary: str | None


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str | None
    ip_address: str | None
    hostname: str | None
    status_code: int | None
    title: str | None
    screenshot_path: str | None
    technologies: list[Any]
    headers: dict | None
    dns_records: list[Any] | dict | None
    waf_detected: str | None
    scan_status: str
    scan_notes: str | None
    open_ports: list[Any]
    cves: list[CVESchema] = []
    suggestions: list[SuggestedScanSchema] = []
    created_at: datetime


class PentestFindingSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scan_id: str
    title: str
    severity: str
    cvss_score: float | None
    cve_ids: list[Any]
    affected_endpoint: str | None
    description: str
    reproduction_steps: str | None
    patch_suggestion: str | None
    created_at: datetime


class PentestResultsResponse(BaseModel):
    scan: "ScanResponse"
    findings: list[PentestFindingSchema] = []


class ScanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    target: str
    scan_type: str
    modules: list[str]
    port_config: dict
    strix_config: dict = {}
    status: str
    completed_stages: list[str] = []
    parent_scan_id: str | None = None
    dork_hits: list[Any]
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    created_at: datetime
    asset_count: int = 0
    cve_count: int = 0
    pentest_findings_count: int = 0
    is_owner: bool = True
    owner_username: str | None = None


class ScanResultsResponse(BaseModel):
    scan: ScanResponse
    assets: list[AssetResponse] = []


class PagedScansResponse(BaseModel):
    items: list[ScanResponse]
    total: int
    page: int
    limit: int
    pages: int


class TriggerSuggestedResponse(BaseModel):
    suggested_scan_id: str
    status: str
    message: str


class PatchScanRequest(BaseModel):
    modules: list[str] | None = None
    port_config: PortConfig | None = None

    @model_validator(mode="after")
    def _validate(self) -> "PatchScanRequest":
        if self.modules is not None:
            if not self.modules:
                raise ValueError("At least one module required")
            if "cve_detection" in self.modules and "tech_fingerprinting" not in self.modules:
                raise ValueError("cve_detection requires tech_fingerprinting")
        return self


class FollowupActiveRequest(BaseModel):
    modules: list[str]
    port_config: PortConfig = PortConfig()
    asset_ids: list[str] | None = None  # if None, all assets from source scan are used

    @model_validator(mode="after")
    def _validate(self) -> "FollowupActiveRequest":
        if not self.modules:
            raise ValueError("At least one active module required")
        invalid = set(self.modules) - ACTIVE_MODULES
        if invalid:
            raise ValueError(
                f"Only active modules are valid for follow-up scans: {', '.join(sorted(invalid))}"
            )
        if "cve_detection" in self.modules and "tech_fingerprinting" not in self.modules:
            raise ValueError("cve_detection requires tech_fingerprinting")
        return self


class FollowupActiveScanItem(BaseModel):
    id: str
    target: str


class FollowupActiveResponse(BaseModel):
    created_scans: list[FollowupActiveScanItem]
    skipped: int


# --- Sharing schemas ---

class UserSummarySchema(BaseModel):
    id: str
    username: str


class CreateGroupRequest(BaseModel):
    name: str
    description: str | None = None


class GroupSummarySchema(BaseModel):
    id: str
    name: str
    description: str | None = None


class ScanShareResponse(BaseModel):
    id: str
    shared_with_user: UserSummarySchema | None = None
    shared_with_group: GroupSummarySchema | None = None
    created_at: datetime


class ShareWithUserRequest(BaseModel):
    user_id: str


class ShareWithGroupRequest(BaseModel):
    group_id: str


# --- Admin schemas ---

class GroupMemberResponse(BaseModel):
    user_id: str
    username: str
    added_at: datetime


class GroupResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    created_at: datetime
    members: list[GroupMemberResponse] = []


class AddMemberRequest(BaseModel):
    user_id: str


class AdminUserResponse(BaseModel):
    id: str
    username: str
    email: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    groups: list[GroupSummarySchema] = []

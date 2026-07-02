import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, field_validator, ConfigDict

# email-validator rejects .local / .internal / .lan as reserved domains even
# with check_deliverability=False, so we use a simple regex instead.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(v: str) -> str:
    v = v.strip()
    if not _EMAIL_RE.match(v):
        raise ValueError("Invalid email address format")
    return v.lower()


EmailField = Annotated[str, AfterValidator(_validate_email)]


class RegisterRequest(BaseModel):
    email: EmailField
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_-]{3,50}$", v):
            raise ValueError(
                "Username must be 3-50 chars: letters, numbers, underscores, hyphens"
            )
        return v

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailField
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    username: str
    is_admin: bool = False

    @classmethod
    def from_orm_user(cls, user) -> "UserResponse":
        return cls(id=str(user.id), email=user.email, username=user.username, is_admin=user.is_admin)


class UserSummary(BaseModel):
    id: str
    username: str

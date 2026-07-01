from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.models import User
from app.auth.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.dependencies import get_current_user, get_db
from app.limiter import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

_AUTH_LIMIT = "5/minute"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(_AUTH_LIMIT)
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(User).where((User.email == body.email) | (User.username == body.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered",
        )

    user = User(
        email=body.email,
        username=body.username,
        password_hash=service.hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    uid = str(user.id)
    return TokenResponse(
        access_token=service.create_access_token(uid),
        refresh_token=service.create_refresh_token(uid),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(_AUTH_LIMIT)
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not service.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    uid = str(user.id)
    return TokenResponse(
        access_token=service.create_access_token(uid),
        refresh_token=service.create_refresh_token(uid),
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(_AUTH_LIMIT)
async def refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    user_id = service.decode_token(body.refresh_token, service.REFRESH_TOKEN_TYPE)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=service.create_access_token(user_id),
        refresh_token=service.create_refresh_token(user_id),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.from_orm_user(current_user)

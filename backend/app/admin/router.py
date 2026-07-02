import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Group, GroupMember, User
from app.dependencies import get_db, require_admin
from app.scans.schemas import (
    AddMemberRequest,
    AdminUserResponse,
    GroupMemberResponse,
    GroupResponse,
    GroupSummarySchema,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    search: str = Query("", max_length=100),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User)
    if search:
        stmt = stmt.where(
            User.username.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )
    result = await db.execute(stmt.order_by(User.username))
    users = list(result.scalars().all())

    if not users:
        return []

    user_ids = [u.id for u in users]
    memberships_result = await db.execute(
        select(GroupMember, Group)
        .join(Group, Group.id == GroupMember.group_id)
        .where(GroupMember.user_id.in_(user_ids))
    )
    groups_by_user: dict[uuid.UUID, list[GroupSummarySchema]] = {}
    for member, group in memberships_result.all():
        groups_by_user.setdefault(member.user_id, []).append(
            GroupSummarySchema(id=str(group.id), name=group.name)
        )

    return [
        AdminUserResponse(
            id=str(u.id),
            username=u.username,
            email=u.email,
            is_admin=u.is_admin,
            is_active=u.is_active,
            created_at=u.created_at,
            groups=groups_by_user.get(u.id, []),
        )
        for u in users
    ]


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------

@router.get("/groups", response_model=list[GroupResponse])
async def list_groups(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Group).order_by(Group.name))
    groups = list(result.scalars().all())

    if not groups:
        return []

    group_ids = [g.id for g in groups]
    members_result = await db.execute(
        select(GroupMember, User)
        .join(User, User.id == GroupMember.user_id)
        .where(GroupMember.group_id.in_(group_ids))
        .order_by(User.username)
    )
    members_by_group: dict[uuid.UUID, list[GroupMemberResponse]] = {}
    for member, user in members_result.all():
        members_by_group.setdefault(member.group_id, []).append(
            GroupMemberResponse(
                user_id=str(user.id),
                username=user.username,
                added_at=member.added_at,
            )
        )

    return [
        GroupResponse(
            id=str(g.id),
            name=g.name,
            description=g.description,
            created_at=g.created_at,
            members=members_by_group.get(g.id, []),
        )
        for g in groups
    ]


@router.post("/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: GroupSummarySchema,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Group).where(Group.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Group name already exists")

    group = Group(name=body.name, description=body.description, created_by=admin.id)
    db.add(group)
    await db.commit()
    await db.refresh(group)

    return GroupResponse(
        id=str(group.id),
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        members=[],
    )


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.delete(group)
    await db.commit()


# ---------------------------------------------------------------------------
# Group membership
# ---------------------------------------------------------------------------

@router.post("/groups/{group_id}/members", status_code=status.HTTP_204_NO_CONTENT)
async def add_member(
    group_id: uuid.UUID,
    body: AddMemberRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    try:
        user_uuid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    user = (await db.execute(select(User).where(User.id == user_uuid))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id, GroupMember.user_id == user_uuid
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    db.add(GroupMember(group_id=group_id, user_id=user_uuid))
    await db.commit()


@router.delete("/groups/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id, GroupMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Membership not found")
    await db.delete(member)
    await db.commit()

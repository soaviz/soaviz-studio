"""
soaviz studio — SQLAlchemy 2.0 모델
schema.sql과 1:1 매칭. main.py에서 import 해서 사용.

설치:
  pip install "sqlalchemy>=2.0" "alembic>=1.13" "asyncpg>=0.29" "psycopg[binary]>=3.2"

사용:
  from db.models import Base, User, Project, Shot, ...
  from sqlalchemy import create_engine
  engine = create_engine(os.environ["DATABASE_URL"])
  Base.metadata.create_all(engine)   # dev 전용 — 프로덕션은 alembic
"""
from __future__ import annotations
import datetime as dt
from typing import Optional, Any

from sqlalchemy import (
    String, Text, Integer, BigInteger, Boolean, DateTime, Date,
    ForeignKey, CheckConstraint, Index, text,
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, CITEXT
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────────────────────
# users
# ─────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(Text)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    oauth_sub: Mapped[Optional[str]] = mapped_column(Text)
    oauth_provider: Mapped[Optional[str]] = mapped_column(Text)
    locale: Mapped[Optional[str]] = mapped_column(Text, default="ko")
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    last_login_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("oauth_provider IN ('google','apple','email','dev')", name="ck_users_oauth_provider"),
    )


# ─────────────────────────────────────────────────────────────
# subscriptions
# ─────────────────────────────────────────────────────────────
class Subscription(Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    monthly_credits: Mapped[int] = mapped_column(Integer, default=0)
    used_credits: Mapped[int] = mapped_column(Integer, default=0)
    character_quota: Mapped[int] = mapped_column(Integer, default=20)
    project_quota: Mapped[int] = mapped_column(Integer, default=5)
    billing_cycle: Mapped[Optional[str]] = mapped_column(Text)
    current_period_start: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    trial_ends_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    provider: Mapped[Optional[str]] = mapped_column(Text)
    provider_customer_id: Mapped[Optional[str]] = mapped_column(Text)
    provider_subscription_id: Mapped[Optional[str]] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    canceled_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("plan IN ('free','standard','pro','team')", name="ck_subs_plan"),
        CheckConstraint("status IN ('active','past_due','canceled','trial','paused')", name="ck_subs_status"),
        CheckConstraint("billing_cycle IN ('monthly','yearly')", name="ck_subs_cycle"),
        CheckConstraint("provider IN ('stripe','toss','none')", name="ck_subs_provider"),
        Index("idx_subs_period_end", "current_period_end"),
    )


# ─────────────────────────────────────────────────────────────
# projects
# ─────────────────────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    logline: Mapped[Optional[str]] = mapped_column(Text)
    format: Mapped[Optional[str]] = mapped_column(Text, default="series")
    genre: Mapped[Optional[str]] = mapped_column(Text)
    color: Mapped[Optional[str]] = mapped_column(Text, default="#A78BFA")
    icon: Mapped[Optional[str]] = mapped_column(Text)
    deadline: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default=text("'{}'"))
    status: Mapped[Optional[str]] = mapped_column(Text, default="active")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint("status IN ('active','paused','completed','archived')", name="ck_projects_status"),
        Index("idx_projects_user_active", "user_id", postgresql_where=text("archived = false")),
        Index("idx_projects_updated", text("updated_at DESC")),
    )


# ─────────────────────────────────────────────────────────────
# episodes
# ─────────────────────────────────────────────────────────────
class Episode(Base):
    __tablename__ = "episodes"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text)
    synopsis: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[Optional[str]] = mapped_column(Text, default="draft")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint("status IN ('draft','outline','script','locked','done')", name="ck_episodes_status"),
        Index("idx_episodes_project", "project_id", "number", postgresql_where=text("archived = false")),
    )


# ─────────────────────────────────────────────────────────────
# scenes
# ─────────────────────────────────────────────────────────────
class Scene(Base):
    __tablename__ = "scenes"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    episode_id: Mapped[str] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    heading: Mapped[Optional[str]] = mapped_column(Text)
    beat: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[Optional[str]] = mapped_column(Text, default="draft")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint("status IN ('draft','outline','script','locked','done')", name="ck_scenes_status"),
        Index("idx_scenes_episode", "episode_id", "number", postgresql_where=text("archived = false")),
        Index("idx_scenes_project", "project_id"),
    )


# ─────────────────────────────────────────────────────────────
# shots
# ─────────────────────────────────────────────────────────────
class Shot(Base):
    __tablename__ = "shots"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    scene_id: Mapped[str] = mapped_column(ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    shot_type: Mapped[Optional[str]] = mapped_column(Text)
    camera_move: Mapped[Optional[str]] = mapped_column(Text)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    prompt: Mapped[Optional[str]] = mapped_column(Text)
    negative_prompt: Mapped[Optional[str]] = mapped_column(Text)
    model: Mapped[Optional[str]] = mapped_column(Text)
    preset_ref: Mapped[Optional[dict]] = mapped_column(JSONB)
    status: Mapped[Optional[str]] = mapped_column(Text, default="draft")
    storage_tier: Mapped[Optional[str]] = mapped_column(Text, default="hot")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint("status IN ('draft','generated','approved','rejected','archived')", name="ck_shots_status"),
        CheckConstraint("storage_tier IN ('hot','warm','cold','frozen')", name="ck_shots_tier"),
        Index("idx_shots_scene", "scene_id", "number", postgresql_where=text("archived = false")),
        Index("idx_shots_project", "project_id"),
    )


# ─────────────────────────────────────────────────────────────
# characters
# ─────────────────────────────────────────────────────────────
class Character(Base):
    __tablename__ = "characters"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[Optional[str]] = mapped_column(Text)
    age: Mapped[Optional[str]] = mapped_column(Text)
    gender: Mapped[Optional[str]] = mapped_column(Text)
    bio: Mapped[Optional[str]] = mapped_column(Text)
    personality: Mapped[Optional[str]] = mapped_column(Text)
    speech_tone: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default=text("'{}'"))
    photo_front: Mapped[Optional[str]] = mapped_column(Text)
    photo_side: Mapped[Optional[str]] = mapped_column(Text)
    photo_back: Mapped[Optional[str]] = mapped_column(Text)
    photo_full: Mapped[Optional[str]] = mapped_column(Text)
    voice_id: Mapped[Optional[str]] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        Index("idx_chars_user_active", "user_id", postgresql_where=text("archived = false")),
        Index("idx_chars_project", "project_id"),
    )


# ─────────────────────────────────────────────────────────────
# styles
# ─────────────────────────────────────────────────────────────
class Style(Base):
    __tablename__ = "styles"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    colors: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    description: Mapped[Optional[str]] = mapped_column(Text)
    reference_url: Mapped[Optional[str]] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    __table_args__ = (
        CheckConstraint("scope IN ('palette','lighting','camera','music','wardrobe','overall')", name="ck_styles_scope"),
        Index("idx_styles_project", "project_id", "scope", postgresql_where=text("archived = false")),
    )


# ─────────────────────────────────────────────────────────────
# assets
# ─────────────────────────────────────────────────────────────
class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    shot_id: Mapped[Optional[str]] = mapped_column(ForeignKey("shots.id", ondelete="SET NULL"))
    prompt_id: Mapped[Optional[str]] = mapped_column(Text)
    parent_asset_id: Mapped[Optional[str]] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[Optional[str]] = mapped_column(Text)
    storage_tier: Mapped[Optional[str]] = mapped_column(Text, default="hot")
    blob_key: Mapped[Optional[str]] = mapped_column(Text)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    width: Mapped[Optional[int]] = mapped_column(Integer)
    height: Mapped[Optional[int]] = mapped_column(Integer)
    mime: Mapped[Optional[str]] = mapped_column(Text)
    model: Mapped[Optional[str]] = mapped_column(Text)
    source_prompt: Mapped[Optional[str]] = mapped_column(Text)
    cost_credits: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    cost_usd_micro: Mapped[Optional[int]] = mapped_column(BigInteger)
    status: Mapped[Optional[str]] = mapped_column(Text, default="queued")
    error: Mapped[Optional[str]] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    ready_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "type IN ('image','video','audio','text','sfx','music','tts','lipsync','upscale','model3d','other')",
            name="ck_assets_type",
        ),
        CheckConstraint("storage_tier IN ('hot','warm','cold','frozen')", name="ck_assets_tier"),
        CheckConstraint(
            "status IN ('queued','generating','ready','failed','expired','archived')",
            name="ck_assets_status",
        ),
        Index("idx_assets_project_type", "project_id", "type", postgresql_where=text("archived = false")),
        Index("idx_assets_shot", "shot_id"),
        Index("idx_assets_status_q", "status", postgresql_where=text("status IN ('queued','generating')")),
        Index("idx_assets_user_recent", "user_id", text("created_at DESC")),
    )


# ─────────────────────────────────────────────────────────────
# activities (append-only)
# ─────────────────────────────────────────────────────────────
class Activity(Base):
    __tablename__ = "activities"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[Optional[str]] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    asset_id: Mapped[Optional[str]] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"))
    shot_id: Mapped[Optional[str]] = mapped_column(ForeignKey("shots.id", ondelete="SET NULL"))
    activity_type: Mapped[str] = mapped_column(Text, nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, server_default=text("CURRENT_DATE"))
    ts: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))

    __table_args__ = (
        Index("idx_act_user_ts", "user_id", text("ts DESC")),
        Index("idx_act_project_ts", "project_id", text("ts DESC")),
        Index("idx_act_type_date", "activity_type", "date"),
    )

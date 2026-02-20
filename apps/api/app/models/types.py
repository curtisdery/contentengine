"""Portable SQLAlchemy column types for cross-dialect compatibility.

Uses PostgreSQL-native JSONB in production, falls back to generic JSON
for other dialects (e.g., SQLite in tests).
"""

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB

# Renders as JSONB on PostgreSQL, JSON on SQLite / other dialects.
JSONB = JSON().with_variant(PG_JSONB(), "postgresql")

"""Create all database tables on first deploy."""

import asyncio

from app.database import engine, Base
from app.models import *  # noqa: F401, F403


async def create_all():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print("Tables created successfully.")


if __name__ == "__main__":
    asyncio.run(create_all())

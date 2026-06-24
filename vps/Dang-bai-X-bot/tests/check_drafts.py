import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from sqlalchemy import select
from src.db import SessionLocal, DraftArticle

async def main():
    async with SessionLocal() as session:
        stmt = select(DraftArticle).order_by(DraftArticle.created_at.desc()).limit(1)
        res = await session.execute(stmt)
        draft = res.scalar_one_or_none()
        if draft:
            payload = dict(draft.payload)
            print('Draft payload keys:', list(payload.keys()))
            print('Images field:', payload.get('images'))
            print('Meta:', payload.get('meta'))

if __name__ == '__main__':
    asyncio.run(main())

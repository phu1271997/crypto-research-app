from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.publishers.wordpress import publish_to_primus


async def main() -> None:
    article = {
        "title": "[TEST] Phase 8 — Bài test đăng WordPress",
        "content": """# [TEST] Phase 8

## Tóm tắt
Đây là bài test publish lên Primus Spark từ bot.

## Bối cảnh
Test bối cảnh.

## Phân tích
Test phân tích.

## Tác động thị trường
Test impact.

## Góc nhìn đầu tư
Test view.

## Kết luận
Test kết luận.
""",
    }

    thumb = ROOT_DIR / "storage" / "images" / "test_thumb.png"
    inline = ROOT_DIR / "storage" / "images" / "test_inline.png"
    thumb_path = str(thumb) if thumb.exists() else None
    inline_path = str(inline) if inline.exists() else None

    result = await publish_to_primus(article, thumb_path, inline_path)
    print(f"Result: {result}")
    if result["status"] == "success":
        print(f"\n👉 Mở browser xem: {result['url']}")
        print("   (Anh nhớ vào WP admin XÓA bài test này sau khi verify)")


if __name__ == "__main__":
    asyncio.run(main())

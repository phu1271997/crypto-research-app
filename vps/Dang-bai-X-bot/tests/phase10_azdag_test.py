from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.publishers.azdag import publish_to_azdag


async def main() -> None:
    article = {
        "title": "[TEST PHASE 10] Bài test AZDAG publisher",
        "content": """# [TEST] Phase 10 AZDAG

## Tóm tắt
Đây là bài test publish lên AZDAG qua Playwright.

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

    thumbnail = None
    inline = None

    print("⚠️ Sắp đăng bài test thật lên AZDAG!")
    print("   Lần đầu sẽ mở browser, anh nhập OTP tay.")
    print("   Anh có 5s để Ctrl+C cancel...")
    await asyncio.sleep(5)

    async def notify(message: str) -> None:
        print(f"[NOTIFY] {message}")

    result = await publish_to_azdag(article, thumbnail, inline, telegram_notifier=notify)

    print("\n=== RESULT ===")
    print(f"Status: {result['status']}")
    print(f"URL: {result['url']}")
    if result.get("last_error"):
        print(f"Error: {result['last_error']}")

    if result["status"] == "success":
        print(f"\n👉 Mở browser xem: {result['url']}")
        print("   ⚠️ Vào AZDAG xóa bài test này!")


if __name__ == "__main__":
    asyncio.run(main())

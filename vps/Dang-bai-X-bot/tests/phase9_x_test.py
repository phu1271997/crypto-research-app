from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.publishers.twitter import publish_to_x_account


async def main() -> None:
    thread = [
        "🧵 [TEST PHASE 9] Testing X thread publisher from a research bot. "
        "This is just a thread test to verify reply chain + media upload work correctly. "
        + ("Filler text to make this tweet long enough for testing long-form. " * 8),
        "[TEST] Tweet 2 in the chain — this should reply to tweet 1 above. "
        "Verifying that in_reply_to_id parameter works as expected. "
        + ("Filler. " * 30),
        "[TEST] Tweet 3 — final tweet with CTA. Read full test research: https://example.com/test-phase-9",
    ]

    thumbnail = None

    print("⚠️ Sắp đăng thread thật lên X1 account!")
    print("   Anh có 5s để Ctrl+C cancel...")
    await asyncio.sleep(5)

    result = await publish_to_x_account("x1", thread, thumbnail)

    print("\n=== RESULT ===")
    print(f"Status: {result['status']}")
    print(f"URL: {result['url']}")
    print(f"Tweet IDs: {result['tweet_ids']}")
    if result.get("last_error"):
        print(f"Last error: {result['last_error']}")

    if result["status"] in ("success", "partial"):
        print(f"\n👉 Mở browser xem: {result['url']}")
        print("   ⚠️ Nhớ XÓA thread test này sau khi verify!")


if __name__ == "__main__":
    asyncio.run(main())

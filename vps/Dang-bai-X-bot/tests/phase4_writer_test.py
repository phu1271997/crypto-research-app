from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.llm_client import OpenRouterClient
from src.researcher.article_writer import REQUIRED_SECTIONS, write_article
from src.settings import settings


def _has_required_sections(content: str) -> bool:
    return all(f"## {section}" in content for section in REQUIRED_SECTIONS)


async def main() -> None:
    try:
        settings.require(["openrouter_api_key", "model_article"])
    except ValueError as exc:
        print(f"Bỏ qua test writer vì thiếu cấu hình: {exc}")
        return

    client = OpenRouterClient(api_key=settings.openrouter_api_key)
    try:
        topic_full = {
            "id": 1,
            "title": "EigenLayer Restaking và làn sóng LRT mới",
            "angle": "Đánh giá restaking còn dư địa tăng trưởng hay đã bước vào giai đoạn nén lợi suất.",
            "key_points": [
                "TVL của restaking thay đổi ra sao sau giai đoạn airdrop",
                "Vai trò của LRT trong chuỗi giá trị mới",
                "Rủi ro định giá khi narrative hạ nhiệt",
            ],
            "sources": [
                "https://www.coingecko.com/",
                "https://www.theblock.co/",
            ],
        }
        result = await write_article(client, topic_full)
        assert Path(result["file_path"]).exists(), "File markdown chưa được tạo."
        assert 1000 <= result["word_count"] <= 1400, "Word count nằm ngoài khoảng kỳ vọng."
        assert _has_required_sections(result["content"]), "Thiếu section bắt buộc."
        print(f"✅ Test 1: {result['title']} | {result['word_count']} từ | {result['file_path']}")
        print(f"   Warnings: {result['warnings']}")

        topic_custom = {
            "id": 0,
            "title": "Phân tích Pendle V3",
            "angle": "User-provided custom topic",
            "key_points": [],
            "sources": [],
        }
        result2 = await write_article(client, topic_custom)
        assert Path(result2["file_path"]).exists(), "File markdown test 2 chưa được tạo."
        assert 1000 <= result2["word_count"] <= 1400, "Word count test 2 nằm ngoài khoảng kỳ vọng."
        assert _has_required_sections(result2["content"]), "Thiếu section bắt buộc ở test 2."
        print(f"✅ Test 2: {result2['title']} | {result2['word_count']} từ | {result2['file_path']}")
        print(f"   Warnings: {result2['warnings']}")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())

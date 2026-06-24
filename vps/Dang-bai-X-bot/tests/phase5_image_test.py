from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.image_gen.generator import generate_images
from src.llm_client import OpenRouterClient
from src.settings import settings


async def main() -> None:
    try:
        settings.require(["openrouter_api_key", "model_image"])
    except ValueError as exc:
        print(f"Bỏ qua test image vì thiếu cấu hình: {exc}")
        return

    client = OpenRouterClient(api_key=settings.openrouter_api_key)
    try:
        article = {
            "article_id": "20260510_test_phase5",
            "title": "EigenLayer Restaking và làn sóng LRT mới",
            "content": """# EigenLayer Restaking
## Phân tích
EigenLayer cho phép restake ETH để bảo mật nhiều giao thức cùng lúc, tạo ra một lớp lợi suất mới và một chuỗi phụ thuộc rủi ro mới.
## Tác động thị trường
LRT TVL đã vượt mạnh trong các giai đoạn narrative nóng, kéo theo định giá hạ tầng restaking và middleware.
## Góc nhìn đầu tư
Nhà đầu tư cần phân biệt giữa tăng trưởng TVL mang tính đầu cơ và adoption bền vững ở lớp ứng dụng.
""",
            "file_path": "dummy.md",
        }
        result = await generate_images(client, article)
        print(f"✅ Thumbnail: {result['thumbnail_path']}")
        print(f"✅ Inline: {result['inline_path']}")
        if not result.get("thumbnail_path") and not result.get("inline_path"):
            print("⚠️ Không tạo được ảnh nào. Khả năng cao do OpenRouter chưa có credit hoặc model image chưa khả dụng.")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())

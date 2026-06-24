from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.llm_client import OpenRouterClient
from src.settings import settings
from src.twitter_writer.thread_writer import write_thread


async def main() -> None:
    try:
        settings.require(["openrouter_api_key", "model_article"])
    except ValueError as exc:
        print(f"Bỏ qua test thread vì thiếu cấu hình: {exc}")
        return

    client = OpenRouterClient(api_key=settings.openrouter_api_key)
    try:
        article = {
            "title": "EigenLayer Restaking và làn sóng LRT mới",
            "content": """# EigenLayer Restaking và làn sóng LRT mới

## Tóm tắt
EigenLayer mở ra mô hình restaking, cho phép ETH staker tái sử dụng ETH đã stake để bảo mật các giao thức khác...

## Bối cảnh
Narrative restaking đang mở rộng từ ETH sang các lớp middleware và AVS mới.

## Phân tích
Cơ chế restaking giúp bootstrap security cho các AVS mới nhưng đồng thời tạo thêm lớp rủi ro phụ thuộc chéo.

## Tác động thị trường
TVL của các LRT (EtherFi, Renzo, Kelp) đã vượt mạnh trong giai đoạn narrative nóng, kéo theo định giá hạ tầng.

## Góc nhìn đầu tư
Rủi ro slashing chéo, áp lực incentive và khác biệt giữa TVL đầu cơ với adoption thật là các điểm cần lưu ý.

## Kết luận
LRT là một narrative quan trọng nhưng cần phân biệt giữa tăng trưởng bền vững và đòn bẩy ngắn hạn.
""",
        }
        result = await write_thread(client, article)
        print(f"✅ Thread: {result['tweet_count']} tweets")
        for index, tweet in enumerate(result["thread"], start=1):
            print(f"\n[{index}] ({len(tweet)} chars)")
            print(tweet)
        if result["warnings"]:
            print(f"\n⚠️ Warnings: {result['warnings']}")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())

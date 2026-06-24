from __future__ import annotations

import asyncio
import struct
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.llm_client import OpenRouterClient
from src.settings import settings


def read_png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG file.")

    width, height = struct.unpack(">II", data[16:24])
    return width, height


async def main() -> None:
    settings.validate_phase1()

    output_path = ROOT_DIR / "storage" / "images" / "phase1_smoke_test.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    client = OpenRouterClient(api_key=settings.openrouter_api_key or "")
    try:
        chat_result = await client.chat(
            model=settings.model_article,
            messages=[
                {
                    "role": "user",
                    "content": "Reply with one short sentence confirming this OpenRouter chat test works.",
                }
            ],
            temperature=0.1,
            max_tokens=80,
        )

        image_bytes = await client.generate_image(
            prompt=(
                "Create a clean, abstract crypto market visualization with glowing network nodes, "
                "dark background, and cyan-green accents. No text."
            ),
            size="1200x630",
        )
        output_path.write_bytes(image_bytes)
    finally:
        await client.aclose()

    width, height = read_png_size(output_path)

    print("Chat test passed:")
    print(chat_result)
    print()
    print(f"Image test passed: {output_path}")
    print(f"PNG dimensions: {width}x{height}")


if __name__ == "__main__":
    asyncio.run(main())

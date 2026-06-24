from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.llm_client import OpenRouterClient
from src.researcher.article_writer import write_article, load_article_from_meta, REQUIRED_SECTIONS
from src.settings import settings


def _has_required_sections(content: str) -> bool:
    return all(f"## {section}" in content for section in REQUIRED_SECTIONS)


async def main() -> None:
    try:
        settings.require(["openrouter_api_key", "model_article"])
    except ValueError as exc:
        print(f"Skipping condensation test due to missing settings: {exc}")
        return

    client = OpenRouterClient(api_key=settings.openrouter_api_key)
    try:
        topic = {
            "id": 999,
            "title": "Blockchain.com IPO confidential filing analysis",
            "angle": "Explain the significance of Blockchain.com filing for IPO secretly in the US and what it means for the crypto ecosystem.",
            "key_points": [
                "Blockchain.com is a mature company founded in 2011",
                "Confidential filing allows them to keep financials private until close to IPO",
                "Signals revival of crypto public market list in 2026/2027",
            ],
            "sources": [],
        }

        print("Testing write_article (which automatically generates the condensed article)...")
        result = await write_article(client, topic)
        
        print("\n--- Long Article Stats ---")
        print(f"Title: {result['title']}")
        print(f"File Path: {result['file_path']}")
        print(f"Word Count: {result['word_count']}")
        print(f"Character Count: {len(result['content'])}")
        
        print("\n--- Condensed Article Stats ---")
        condensed = result['condensed_content']
        print(f"Character Count: {len(condensed)}")
        print(f"Has all sections: {_has_required_sections(condensed)}")
        
        # Verify length
        assert len(condensed) <= 2000, f"Condensed article is too long: {len(condensed)} characters"
        assert _has_required_sections(condensed), "Condensed article is missing sections"
        print("✅ Condensed article is under 2000 characters and contains all sections!")
        
        # Print content for manual visual inspection
        print("\n--- Condensed Article Content Preview ---")
        print(condensed[:500] + "\n...")

        print("\nTesting load_article_from_meta (loading back)...")
        loaded = await load_article_from_meta(result, client)
        assert loaded["condensed_content"] == condensed, "Loaded condensed content does not match original"
        print("✅ load_article_from_meta loaded condensed content successfully!")

    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())

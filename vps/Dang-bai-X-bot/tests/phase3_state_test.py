from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.db import State, clear_state, get_state, set_state


async def main() -> None:
    user_id = 990003
    payload = {
        "topic": {
            "id": 7,
            "title": "Test state machine",
            "angle": "Kiểm tra serialize payload",
        }
    }

    await clear_state(user_id)
    await set_state(user_id, State.WRITING, payload)

    state_row = await get_state(user_id)
    assert state_row is not None, "Không lấy được state vừa lưu."
    assert state_row.state == State.WRITING, "State lưu sai."

    parsed_payload = json.loads(state_row.payload or "{}")
    assert parsed_payload == payload, "Payload serialize/deserialize không khớp."

    await clear_state(user_id)
    cleared = await get_state(user_id)
    assert cleared is None, "State chưa được clear."

    print("✅ Phase 3 state test pass")


if __name__ == "__main__":
    asyncio.run(main())

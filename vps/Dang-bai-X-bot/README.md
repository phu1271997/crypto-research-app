# Crypto Research Bot for VC Fund

This repository contains a local-first Python bot that automates crypto topic discovery, Vietnamese article writing, image generation, preview review in Telegram, and multi-platform publishing.

## Status

Phase 1 is scaffolded:

- Project structure and prompt files are in place.
- Configuration loading is implemented in `src/settings.py`.
- OpenRouter chat and image generation are implemented in `src/llm_client.py`.
- A smoke test is available at `tests/phase1_smoke_test.py`.

The full setup, VPS deployment guide, and operational README will be completed in Phase 11.

## Telegram nhanh gọn

1. Mở Telegram và chat với `@BotFather`.
2. Gõ `/newbot`, đặt tên bot và username cho bot.
3. BotFather sẽ trả về `TELEGRAM_BOT_TOKEN`, copy giá trị đó vào `.env`.
4. Nhắn cho bot của anh ít nhất 1 tin bất kỳ, ví dụ `/start`.
5. Mở trình duyệt với URL: `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates`
6. Tìm `chat.id` trong JSON trả về và copy vào `TELEGRAM_CHAT_ID`.
7. Chỉ đúng `TELEGRAM_CHAT_ID` này mới được bot trả lời; tài khoản khác sẽ bị ignore hoàn toàn.

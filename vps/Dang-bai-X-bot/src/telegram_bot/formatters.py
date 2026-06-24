from __future__ import annotations

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.helpers import escape_markdown


def format_topics_message(topics: list[dict]) -> tuple[str, InlineKeyboardMarkup]:
    """
    Format topics thành 1 message + các nút bấm số xếp ngang (5 nút một dòng).
    """
    MAX_MSG_CHARS = 3800
    count = len(topics)
    lines = [f"🔥 *{count} chủ đề hot 48h qua*", ""]
    buttons: list[list[InlineKeyboardButton]] = []

    row: list[InlineKeyboardButton] = []
    for index, topic in enumerate(topics, start=1):
        raw_title = str(topic.get("title", "Không có tiêu đề"))
        raw_angle = str(topic.get("angle", "Chưa có góc nhìn"))
        if len(raw_angle) > 100:
            raw_angle = raw_angle[:97] + "..."
        title = escape_markdown(raw_title, version=1)
        angle = escape_markdown(raw_angle, version=1)
        topic_id = str(topic.get("id", index))

        lines.append(f"*{index}.* {title}")
        lines.append(f"_💡 {angle}_")
        lines.append("")
        row.append(InlineKeyboardButton(text=f"{index}", callback_data=f"topic_select:{topic_id}"))
        if len(row) == 5:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)

    lines.append("👇 Bấm số để chọn topic")
    keyboard = InlineKeyboardMarkup(buttons)
    full_text = "\n".join(lines)
    if len(full_text) > MAX_MSG_CHARS:
        full_text = full_text[: MAX_MSG_CHARS - 3] + "..."
    return full_text, keyboard


def format_x_format_choice(topic_title: str) -> tuple[str, InlineKeyboardMarkup]:
    escaped = escape_markdown(topic_title, version=1)
    text = (
        f"✅ Đã chọn topic: *{escaped}*\n\n"
        "📝 Bước 2/4: Anh muốn viết bài trên X dưới định dạng nào?\n"
        "• 🧵 *Twitter Thread* = Chuỗi 3-4 posts dài\n"
        "• 📄 *X Article* = 1 bài viết dài duy nhất"
    )
    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🧵 Twitter Thread", callback_data="x_format:thread"),
            InlineKeyboardButton("📄 X Article", callback_data="x_format:article"),
        ],
    ])
    return text, keyboard


def format_platform_choice(topic_title: str, x_format: str) -> tuple[str, InlineKeyboardMarkup]:
    escaped_title = escape_markdown(topic_title, version=1)
    escaped_format = "Thread" if x_format == "thread" else "Article"
    text = (
        f"✅ Đã chọn topic: *{escaped_title}*\n"
        f"📝 Định dạng X: *{escaped_format}*\n\n"
        "📢 Bước 3/4: Anh muốn bài này thuộc brand/platform nào?\n"
        "• 🔵 *Primus Spark* = Web Primus + X1 Primus\n"
        "• 🟠 *AZDAG* = Web AZDAG + X2 AZDAG"
    )
    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🔵 Primus Spark", callback_data="platform:primus"),
            InlineKeyboardButton("🟠 AZDAG", callback_data="platform:azdag"),
        ],
    ])
    return text, keyboard


def format_publish_mode_choice(topic_title: str, x_format: str, target_platform: str) -> tuple[str, InlineKeyboardMarkup]:
    escaped_title = escape_markdown(topic_title, version=1)
    escaped_format = "Thread" if x_format == "thread" else "Article"
    platform_label = "Primus Spark" if target_platform == "primus" else "AZDAG"
    web_label = "Web Primus" if target_platform == "primus" else "Web AZDAG"
    x_label = "X1 Primus" if target_platform == "primus" else "X2 AZDAG"
    text = (
        f"✅ Đã chọn topic: *{escaped_title}*\n"
        f"📝 Định dạng X: *{escaped_format}*\n"
        f"🎯 Platform: *{escape_markdown(platform_label, version=1)}*\n\n"
        "🚀 Bước 4/4: Anh muốn publish theo kiểu nào?\n"
        f"• 🌐+🐦 *Đăng cả web và X* = {escape_markdown(web_label, version=1)} + {escape_markdown(x_label, version=1)}\n"
        f"• 🌐 *Chỉ web* = Chỉ đăng {escape_markdown(web_label, version=1)}\n"
        f"• 🐦 *Chỉ X* = Chỉ đăng {escape_markdown(x_label, version=1)}"
    )
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("🌐+🐦 Đăng cả web và X", callback_data="publish_mode:both")],
        [InlineKeyboardButton("🌐 Chỉ web", callback_data="publish_mode:web_only")],
        [InlineKeyboardButton("🐦 Chỉ X", callback_data="publish_mode:x_only")],
    ])
    return text, keyboard


def format_writing_progress(step: str) -> str:
    progress_map = {
        "researching": "🔍 Đang nghiên cứu chủ đề...",
        "writing": "✍️ Đang viết bài tiếng Việt (hard cap 2100 từ)...",
        "images": "🎨 Đang tạo 2 ảnh (thumbnail + inline)...",
        "thread": "🐦 Đang viết Twitter thread (English, 3-4 posts dài)...",
        "x_article": "📝 Đang viết bài luận X Article (English, dài)...",
    }
    return progress_map.get(step, f"⏳ {step}...")


def format_error(error: str) -> str:
    escaped_error = escape_markdown(error, version=2)
    return (
        "❌ Có lỗi xảy ra:\n"
        "```\n"
        f"{escaped_error}\n"
        "```\n"
        "Vui lòng thử lại hoặc /cancel"
    )

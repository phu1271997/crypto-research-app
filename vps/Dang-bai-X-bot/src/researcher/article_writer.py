from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from pathlib import Path

from loguru import logger

from src.llm_client import OpenRouterClient
from src.settings import ROOT_DIR, config, settings

ARTICLES_DIR = ROOT_DIR / "storage" / "articles"
PROMPT_PATH = ROOT_DIR / "prompts" / "article_vn.md"

REQUIRED_SECTIONS = [
    "Tóm tắt",
    "Bối cảnh",
    "Phân tích",
    "Tác động thị trường",
    "Rủi ro và biến số cần theo dõi",
    "Kết luận",
]
MAX_ARTICLE_WORDS = 2100
MAX_ARTICLE_GENERATION_ATTEMPTS = 3


def _slugify(title: str, max_len: int = 60) -> str:
    """
    Convert a Vietnamese title into a safe ASCII slug for filenames.
    """
    normalized_input = title.replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFKD", normalized_input)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9\s-]", "", ascii_text).strip().lower()
    slug = re.sub(r"[\s_-]+", "-", slug).strip("-")
    if not slug:
        slug = "article"
    return slug[:max_len].rstrip("-")


def _load_prompt_template() -> str:
    if not PROMPT_PATH.exists():
        raise FileNotFoundError(f"Không tìm thấy prompt file: {PROMPT_PATH}")
    return PROMPT_PATH.read_text(encoding="utf-8")


def _render_bullets(values: list[str], empty_fallback: str) -> str:
    cleaned_values = [value.strip() for value in values if isinstance(value, str) and value.strip()]
    if not cleaned_values:
        return empty_fallback
    return "\n".join(f"- {value}" for value in cleaned_values)


def _render_prompt(topic: dict) -> str:
    """
    Render the article prompt from the Markdown template.
    """
    key_points = _render_bullets(
        topic.get("key_points", []),
        "(Không có, hãy tự research dựa trên kiến thức của bạn)",
    )
    sources = _render_bullets(
        topic.get("sources", []),
        "(Không có, hãy tự research dựa trên kiến thức của bạn)",
    )

    return (
        _load_prompt_template()
        .replace("{title}", str(topic.get("title", "")).strip())
        .replace("{angle}", str(topic.get("angle", "")).strip() or "Chưa có angle cụ thể, hãy tự xác định luận điểm phù hợp.")
        .replace("{key_points}", key_points)
        .replace("{sources}", sources)
    )


def _count_vietnamese_words(text: str) -> int:
    """
    Count words after stripping Markdown-heavy syntax and code blocks.
    """
    without_code_blocks = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    without_inline_code = re.sub(r"`[^`]*`", " ", without_code_blocks)
    without_links = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", without_inline_code)
    without_markdown = re.sub(r"(^|\s)[#>*_~-]+", " ", without_links, flags=re.MULTILINE)
    normalized = re.sub(r"\s+", " ", without_markdown).strip()
    if not normalized:
        return 0
    return len(normalized.split())


def _is_list_line(line: str) -> bool:
    return bool(re.match(r"^\s*(?:[-*]\s+|\d+\.\s+)", line))


def _normalize_markdown_structure(content: str) -> str:
    """
    Chuẩn hóa markdown để WordPress render list đúng:
    - thêm dòng trống trước block list nếu thiếu
    - thêm dòng trống sau block list nếu thiếu
    """
    source_lines = content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    flattened: list[str] = []
    index = 0

    while index < len(source_lines):
        line = source_lines[index].rstrip()
        stripped = line.strip()

        heading_match = re.match(r"^\s*###\s+(.+)$", line)
        if heading_match:
            flattened.extend(["", f"**{heading_match.group(1).strip()}**", ""])
            index += 1
            continue

        ordered_match = re.match(r"^\s*\d+\.\s+(.*)$", line)
        if ordered_match:
            parts = [ordered_match.group(1).strip()]
            look_ahead = index + 1
            while look_ahead < len(source_lines):
                candidate = source_lines[look_ahead].rstrip()
                candidate_stripped = candidate.strip()
                if not candidate_stripped:
                    look_ahead += 1
                    if look_ahead < len(source_lines):
                        next_non_empty = source_lines[look_ahead].strip()
                        if re.match(r"^(?:\d+\.\s+|[-*]\s+|##\s+|###\s+)", next_non_empty):
                            break
                    continue
                if re.match(r"^(?:\d+\.\s+|[-*]\s+|##\s+|###\s+)", candidate_stripped):
                    break
                if candidate.startswith(" ") or candidate.startswith("\t"):
                    parts.append(candidate_stripped)
                    look_ahead += 1
                    continue
                break
            flattened.append(f"- {' '.join(parts)}")
            index = look_ahead
            continue

        flattened.append(line)
        index += 1

    normalized: list[str] = []
    for line in flattened:
        is_list = _is_list_line(line)
        previous = normalized[-1] if normalized else ""
        previous_is_list = _is_list_line(previous) if normalized else False

        if is_list and normalized and previous.strip() and not previous_is_list:
            normalized.append("")

        if not is_list and previous_is_list and line.strip():
            normalized.append("")

        normalized.append(line.rstrip())

    cleaned = "\n".join(normalized)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip() + "\n"
    return cleaned


def _extract_h1_title(content: str) -> str | None:
    match = re.search(r"^\s*#\s+(.+?)\s*$", content, flags=re.MULTILINE)
    if not match:
        return None
    return match.group(1).strip()


def _validate_article(content: str) -> tuple[bool, list[str]]:
    """
    Validate the generated Markdown article and return warnings.
    """
    warnings: list[str] = []
    stripped = content.lstrip()
    if not stripped.startswith("# "):
        warnings.append("Bài viết không bắt đầu bằng H1 đúng định dạng '# Tiêu đề'.")

    for section in REQUIRED_SECTIONS:
        marker = f"## {section}"
        if marker not in content:
            warnings.append(f"Thiếu section bắt buộc: {marker}")

    word_count = _count_vietnamese_words(content)
    if word_count > MAX_ARTICLE_WORDS:
        warnings.append(
            f"Số từ hiện tại là {word_count}, vượt quá hard limit {MAX_ARTICLE_WORDS} từ cho Primus/AZDAG."
        )

    return not warnings, warnings


def truncate_markdown(text: str, max_chars: int = 2000) -> str:
    if len(text) <= max_chars:
        return text
    limit = max_chars - 3
    truncated = text[:limit]
    
    # 1. Try double newline (paragraph) in the last 400 characters
    p_idx = truncated.rfind("\n\n", max(0, limit - 400))
    if p_idx != -1:
        return truncated[:p_idx].rstrip() + "\n\n..."
        
    # 2. Try single newline (line break) in the last 150 characters
    n_idx = truncated.rfind("\n", max(0, limit - 150))
    if n_idx != -1:
        return truncated[:n_idx].rstrip() + "\n\n..."
        
    # 3. Try space (word break) in the last 80 characters
    s_idx = truncated.rfind(" ", max(0, limit - 80))
    if s_idx != -1:
        return truncated[:s_idx].rstrip() + "..."
        
    # 4. Fallback: hard cut
    return truncated.rstrip() + "..."


async def condense_article(client: OpenRouterClient, title: str, content: str) -> str:
    """
    Sử dụng LLM rút gọn bài viết dài dưới 2000 ký tự mà vẫn giữ cấu trúc research.
    """
    prompt = f"""Hãy viết lại bài research tiếng Việt sau đây thành một bài viết cô đọng, chất lượng cao dành riêng để đăng lên website.

TOPIC: {title}

NỘI DUNG BÀI GỐC:
{content}

YÊU CẦU BẮT BUỘC:
1. Độ dài: Tổng số ký tự của bài viết đầu ra (bao gồm cả các tiêu đề, ký tự markdown, khoảng trắng) phải DƯỚI 2000 ký tự (khoảng 270-330 từ). Đây là giới hạn hiển thị của website, nếu dài hơn sẽ bị lỗi hiển thị. Hãy viết thật cô đọng và ngắn gọn ở từng mục.
2. Giữ nguyên tiêu đề H1 gốc ở dòng đầu tiên: # {title}
3. Cấu trúc bài viết phải có đầy đủ các phần sau (sử dụng tiêu đề H2):
   ## Tóm tắt
   ## Bối cảnh
   ## Phân tích
   ## Tác động thị trường
   ## Rủi ro và biến số cần theo dõi
   ## Kết luận
4. Văn phong: Giữ vững tính chuyên nghiệp, trung lập, research-grade. Mỗi phần H2 chỉ viết từ 1 đến 3 câu ngắn gọn nhưng đầy đủ ý nghĩa phân tích sâu sắc, không viết lan man.
5. Tuyệt đối không thêm bất kỳ thông tin bình luận, meta-commentary hay lời chào nào. Chỉ trả về duy nhất nội dung markdown bài viết.
"""
    logger.info("Bắt đầu rút gọn bài viết để đăng website...")
    current_prompt = prompt
    condensed = ""
    for attempt in range(2):
        try:
            condensed = await client.chat(
                model=settings.model_article,
                messages=[{"role": "user", "content": current_prompt}],
                temperature=0.3,
                max_tokens=2500,
            )
            condensed = _normalize_markdown_structure(condensed)
            char_count = len(condensed)
            logger.info("Lần thử {}: Số ký tự bài rút gọn = {}", attempt + 1, char_count)
            if char_count <= 1950:
                return condensed
            
            # If too long, retry with warning
            current_prompt = f"{prompt}\n\n⚠️ LƯU Ý: Bài viết trước của bạn dài {char_count} ký tự, vượt quá giới hạn 2000 ký tự. Vui lòng rút gọn ngắn hơn nữa, viết cực kỳ cô đọng!"
        except Exception as e:
            logger.warning("Lỗi khi gọi LLM rút gọn ở lần thử {}: {}", attempt + 1, e)
            if attempt == 1:
                if condensed:
                    break
                raise
        
    # Fallback to truncation if still too long
    logger.warning("Rút gọn bằng LLM vẫn vượt quá 2000 ký tự. Sử dụng fallback truncation.")
    return truncate_markdown(condensed, 1950)


async def load_article_from_meta(article_meta: dict, client: OpenRouterClient | None = None) -> dict:
    """
    Load lại full article từ metadata đã lưu trong DB payload.
    """
    file_path_raw = str(article_meta.get("file_path", "")).strip()
    if not file_path_raw:
        raise FileNotFoundError("Metadata bài viết không có file_path hợp lệ.")

    file_path = Path(file_path_raw)
    if not file_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file bài viết tại: {file_path}")

    try:
        content = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        logger.warning("File bài viết {} có vấn đề encoding, đọc với errors='replace'.", file_path)
        content = file_path.read_text(encoding="utf-8", errors="replace")

    if not content.strip():
        raise ValueError(f"File bài viết tại {file_path} đang rỗng.")

    _, warnings = _validate_article(content)
    word_count = _count_vietnamese_words(content)
    title = str(article_meta.get("title", "")).strip() or _extract_h1_title(content) or "Untitled Article"
    slug = str(article_meta.get("slug", "")).strip() or _slugify(title)
    article_id = str(article_meta.get("article_id", "")).strip() or file_path.stem

    # Check for condensed file
    condensed_file = file_path.with_name(f"{article_id}_condensed.md")
    if condensed_file.exists():
        condensed_content = condensed_file.read_text(encoding="utf-8")
    else:
        if client:
            condensed_content = await condense_article(client, title, content)
            condensed_file.write_text(condensed_content.strip() + "\n", encoding="utf-8")
        else:
            logger.warning("Không tìm thấy file condensed và không truyền client. Fallback sang truncation.")
            condensed_content = truncate_markdown(content, 1950)

    return {
        "article_id": article_id,
        "title": title,
        "slug": slug,
        "content": content,
        "condensed_content": condensed_content,
        "file_path": str(file_path.resolve()),
        "word_count": word_count,
        "warnings": warnings,
        "topic": None,
    }


async def write_article(client: OpenRouterClient, topic: dict) -> dict:
    """
    Generate a Vietnamese research article and persist it to storage.
    Enforces a hard cap of 2100 words for downstream publishing constraints.
    """
    ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
    base_prompt = _render_prompt(topic)

    logger.info("Bắt đầu viết bài research cho topic: {}", topic.get("title", "Không có tiêu đề"))
    content = ""
    warnings: list[str] = []
    word_count = 0

    for attempt in range(1, MAX_ARTICLE_GENERATION_ATTEMPTS + 1):
        prompt = base_prompt
        if attempt > 1:
            prompt += (
                f"\n\nBẮT BUỘC SỬA LẠI: Bản trước dài {word_count} từ, vượt quá hard limit {MAX_ARTICLE_WORDS} từ. "
                f"Hãy viết lại ngắn hơn, vẫn giữ đủ 6 section, nhưng TUYỆT ĐỐI không vượt quá {MAX_ARTICLE_WORDS} từ."
            )

        content = await client.chat(
            model=settings.model_article,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=8000,
        )
        content = _normalize_markdown_structure(content)

        _, warnings = _validate_article(content)
        word_count = _count_vietnamese_words(content)
        if word_count <= MAX_ARTICLE_WORDS:
            break

        logger.warning(
            "Article attempt {} vượt hard limit: {} từ > {} từ.",
            attempt,
            word_count,
            MAX_ARTICLE_WORDS,
        )

    exceeded_hard_limit = word_count > MAX_ARTICLE_WORDS
    if exceeded_hard_limit:
        warnings = list(
            dict.fromkeys(
                [
                    *warnings,
                    f"LLM vẫn vượt hard limit {MAX_ARTICLE_WORDS} từ sau {MAX_ARTICLE_GENERATION_ATTEMPTS} lần thử. Bản gần nhất có {word_count} từ.",
                ]
            )
        )

    is_valid, warnings = _validate_article(content)
    if exceeded_hard_limit:
        warnings = list(
            dict.fromkeys(
                [
                    *warnings,
                    f"LLM vẫn vượt hard limit {MAX_ARTICLE_WORDS} từ sau {MAX_ARTICLE_GENERATION_ATTEMPTS} lần thử. Bản gần nhất có {word_count} từ.",
                ]
            )
        )
    generated_title = _extract_h1_title(content) or str(topic.get("title", "")).strip() or "Untitled Article"
    slug = _slugify(generated_title)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    article_id = f"{timestamp}_{slug}"
    file_path = ARTICLES_DIR / f"{article_id}.md"
    file_path.write_text(content.strip() + "\n", encoding="utf-8")

    condensed_content = await condense_article(client, generated_title, content)
    condensed_file_path = file_path.with_name(f"{article_id}_condensed.md")
    condensed_file_path.write_text(condensed_content.strip() + "\n", encoding="utf-8")

    if warnings:
        for warning in warnings:
            logger.warning("Cảnh báo validation bài viết '{}': {}", generated_title, warning)

    logger.info(
        "Đã lưu bài viết '{}' tại {} | số từ={} | hợp lệ={}",
        generated_title,
        file_path,
        word_count,
        is_valid,
    )

    return {
        "article_id": article_id,
        "title": generated_title,
        "slug": slug,
        "content": content,
        "condensed_content": condensed_content,
        "file_path": str(file_path.resolve()),
        "word_count": word_count,
        "warnings": warnings,
        "topic": topic,
        "needs_length_approval": exceeded_hard_limit,
        "length_limit_words": MAX_ARTICLE_WORDS,
    }

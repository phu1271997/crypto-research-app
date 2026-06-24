import asyncio
import json
import os
import subprocess
import uuid
import sys
from datetime import UTC, datetime
from loguru import logger
from sqlalchemy import select, update, text

# Add parent directory to path to import src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.db import SessionLocal, BotCommand, init_db
from src.settings import settings

HERMES_PATH = "/root/.hermes/hermes-agent/venv/bin/hermes"
START_TAG = "<<<PRIMUS_JSON_START>>>"
END_TAG = "<<<PRIMUS_JSON_END>>>"

def extract_balanced_json(text_content):
    start = text_content.find('{')
    if start == -1:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text_content)):
        ch = text_content[i]
        if esc:
            esc = False
            continue
        if in_str:
            if ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return text_content[start:i+1]
    return None

def extract_json_payload(raw_output):
    region = raw_output
    s = raw_output.rfind(START_TAG)
    if s != -1:
        a = raw_output[s + len(START_TAG):]
        e = a.find(END_TAG)
        region = a[:e] if e != -1 else a
    
    # Remove markdown formatting if any
    region = region.replace("```json", "").replace("```", "").strip()
    
    # Try parsing
    try:
        return json.loads(region)
    except Exception:
        pass
        
    # Try extracting balanced json
    balanced = extract_balanced_json(region) or extract_balanced_json(raw_output)
    if balanced:
        try:
            return json.loads(balanced)
        except Exception:
            pass
            
    raise ValueError("Không bóc tách được JSON kết quả từ Bốp.")

def run_hermes_cli(prompt):
    logger.info(f"Running Hermes CLI with prompt length: {len(prompt)}")
    res = subprocess.run(
        [HERMES_PATH, "-z", prompt, "--profile", "jj"],
        capture_output=True,
        text=True,
        timeout=480 # 8 minutes timeout
    )
    if res.returncode != 0:
        logger.error(f"Hermes CLI error: {res.stderr}")
        raise RuntimeError(f"Hermes CLI returned non-zero code {res.returncode}: {res.stderr}")
    return res.stdout

async def handle_research(command: BotCommand):
    payload = command.payload
    url = payload.get("url")
    scraped_text = payload.get("scrapedText", "")
    raw_input = payload.get("rawInput", "")
    project_name = payload.get("name", "Dự án")
    
    prompt = f"""
Bốp ơi, hãy tiến hành Due Diligence chuyên sâu cho dự án này.
Tên dự án: {project_name}
Website URL: {url}
Nội dung website cào được:
---
{scraped_text[:12000]}
---

Yêu cầu thêm từ người dùng: {raw_input}

Hãy tìm thêm thông tin: team background (LinkedIn, Twitter), backers/investors, tokenomics, traction (TVL, users, volume), GitHub activity, audit.
Hãy đánh giá khắt khe, skeptical by default.

Cuối cùng in kết quả dưới dạng JSON hợp lệ nằm giữa hai mốc {START_TAG} và {END_TAG} theo cấu trúc:
{START_TAG}
{{
  "projectName": "{project_name}",
  "website": "{url}",
  "summary": "Tóm tắt dự án",
  "scores": {{
    "teamFounders": {{ "score": null, "max": 10, "reasoning": "...", "confidence": "..." }},
    "marketTiming": {{ "score": null, "max": 16, "reasoning": "...", "confidence": "..." }},
    "productProblem": {{ "score": null, "max": 21, "reasoning": "...", "confidence": "..." }},
    "techSecurity": {{ "score": null, "max": 17, "reasoning": "...", "confidence": "..." }},
    "tractionMetrics": {{ "score": null, "max": 14, "reasoning": "...", "confidence": "..." }},
    "businessMoat": {{ "score": null, "max": 12, "reasoning": "...", "confidence": "..." }},
    "tokenomics": {{ "score": null, "max": 6, "reasoning": "...", "confidence": "..." }},
    "dealValuation": {{ "score": null, "max": 4, "reasoning": "...", "confidence": "..." }}
  }},
  "totalScore": 0,
  "detailedAssessment": "...",
  "strengths": [],
  "risks": [],
  "redFlags": [],
  "recommendation": "INVEST / PASS / NEED MORE INFO",
  "questionsForFounder": []
}}
{END_TAG}
"""
    stdout = run_hermes_cli(prompt)
    result_json = extract_json_payload(stdout)
    
    # Update command payload with result
    async with SessionLocal() as session:
        result = await session.execute(select(BotCommand).where(BotCommand.id == command.id))
        cmd = result.scalar_one()
        cmd_payload = dict(cmd.payload)
        cmd_payload["result"] = result_json
        cmd.payload = cmd_payload
        cmd.status = "done"
        cmd.updated_at = datetime.now(UTC)
        await session.commit()
    logger.info(f"RESEARCH command #{command.id} completed successfully.")

async def handle_social_scan(command: BotCommand):
    payload = command.payload
    projects = payload.get("projects", [])
    if not projects:
        raise ValueError("Danh sách dự án trống.")
        
    current_time = datetime.now(UTC).isoformat()
    
    for p in projects:
        p_id = p.get("id")
        p_name = p.get("name")
        p_website = p.get("website")
        logger.info(f"Scanning social progress for project: {p_name} ({p_id})")
        
        prompt = f"""
Bốp ơi, hãy quét và phân tích hoạt động mạng xã hội (Twitter/X, Telegram, Discord, GitHub) của dự án này trong 7 ngày qua.
Tên dự án: {p_name}
Website: {p_website}

Hãy tìm các kênh MXH của dự án (Twitter/X, Telegram, Discord, GitHub, Medium/Blog), kiểm tra lượng followers/members, số bài đăng trong 7 ngày qua, và mức độ tương tác.
Hãy chỉ ra các tín hiệu tích cực (progress_signals) và rủi ro/red flags (red_flags).
Đánh giá xu hướng xung lực (momentum) của dự án: 'accelerating' (bứt phá), 'steady' (ổn định), 'slowing' (chậm lại), hoặc 'inactive' (tạm ngưng).

Cuối cùng in báo cáo dưới dạng JSON hợp lệ nằm giữa hai mốc {START_TAG} và {END_TAG} theo cấu trúc:
{START_TAG}
{{
  "project_name": "{p_name}",
  "scanned_at": "{current_time}",
  "channels": [
    {{
      "platform": "Twitter",
      "url": "https://x.com/project_handle",
      "last_post_at": "2026-06-21T18:00:00Z",
      "post_count_7d": 12,
      "follower_count": 45200,
      "follower_delta_7d": 850,
      "engagement_notes": "Tương tác tốt..."
    }}
  ],
  "activity_summary": "Tóm tắt hoạt động nổi bật...",
  "progress_signals": [],
  "red_flags": [],
  "momentum": "steady",
  "overall_note": "Đánh giá chung..."
}}
{END_TAG}
"""
        stdout = run_hermes_cli(prompt)
        report_json = extract_json_payload(stdout)
        
        # Save report directly to scan_reports table
        report_id = str(uuid.uuid4())
        async with SessionLocal() as session:
            sql = text("""
                INSERT INTO scan_reports (id, project_id, scanned_at, payload, status, error, created_at)
                VALUES (:id, :project_id, CURRENT_TIMESTAMP, :payload, 'done', NULL, CURRENT_TIMESTAMP)
            """)
            await session.execute(sql, {
                "id": report_id,
                "project_id": p_id,
                "payload": json.dumps(report_json, ensure_ascii=False)
            })
            await session.commit()
        logger.info(f"Successfully saved scan report for project: {p_name}")
        
    async with SessionLocal() as session:
        result = await session.execute(select(BotCommand).where(BotCommand.id == command.id))
        cmd = result.scalar_one()
        cmd.status = "done"
        cmd.updated_at = datetime.now(UTC)
        await session.commit()
    logger.info(f"SOCIAL_SCAN command #{command.id} completed successfully.")

async def process_command(command: BotCommand):
    try:
        if command.type == "RESEARCH":
            await handle_research(command)
        elif command.type == "SOCIAL_SCAN":
            await handle_social_scan(command)
        else:
            raise ValueError(f"Không hỗ trợ loại lệnh: {command.type}")
    except Exception as exc:
        logger.error(f"Lỗi khi xử lý lệnh #{command.id}: {exc}")
        error_msg = str(exc)
        async with SessionLocal() as session:
            result = await session.execute(select(BotCommand).where(BotCommand.id == command.id))
            cmd = result.scalar_one()
            cmd.status = "failed"
            cmd.error = error_msg
            cmd.updated_at = datetime.now(UTC)
            await session.commit()

async def main_loop():
    logger.info("Bop Worker loop started polling database for RESEARCH & SOCIAL_SCAN...")
    while True:
        try:
            command = None
            async with SessionLocal() as session:
                stmt = select(BotCommand).where(
                    BotCommand.status == "pending",
                    BotCommand.type.in_(["RESEARCH", "SOCIAL_SCAN"])
                ).order_by(BotCommand.id.asc()).limit(1)
                result = await session.execute(stmt)
                command = result.scalar_one_or_none()
                if command:
                    command.status = "processing"
                    command.updated_at = datetime.now(UTC)
                    await session.commit()
                    cmd_id = command.id
                    cmd_type = command.type
                    
            if command:
                logger.info(f"Processing Bop command #{cmd_id} ({cmd_type})")
                async with SessionLocal() as session:
                    res = await session.execute(select(BotCommand).where(BotCommand.id == cmd_id))
                    active_command = res.scalar_one()
                    await process_command(active_command)
        except Exception as e:
            logger.error(f"Error in Bop worker loop: {e}")
        await asyncio.sleep(4)

async def main():
    logger.info("🚀 Khởi động Bop Worker process...")
    await init_db()
    await main_loop()

if __name__ == "__main__":
    asyncio.run(main())

"""
Tool tự dò selectors AZDAG.

Chạy 1 lần, output ra docs/azdag_selectors.yaml.
Sau đó publisher sẽ load file này.

Usage:
    DEBUG_PLAYWRIGHT=true python scripts/azdag_inspect.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml
from playwright.async_api import Page, async_playwright

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.settings import ROOT_DIR as APP_ROOT, settings

OUTPUT_FILE = APP_ROOT / "docs" / "azdag_selectors.yaml"
SCREENSHOTS_DIR = APP_ROOT / "logs" / "azdag_inspect"


async def prompt_user(message: str) -> str:
    """Hỏi user qua console theo cách không block event loop."""
    print(f"\n{'=' * 60}\n👉 {message}\n{'=' * 60}")
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, input, "→ Bấm ENTER khi xong (hoặc gõ giá trị nếu được hỏi): ")


async def scan_form_inputs(page: Page) -> list[dict]:
    """Scan tất cả input/textarea/contenteditable visible trên page."""
    return await page.evaluate(
        """
        () => {
            const inputs = [];
            document.querySelectorAll('input, textarea, [contenteditable="true"]').forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                inputs.push({
                    tag: el.tagName.toLowerCase(),
                    type: el.type || null,
                    name: el.name || null,
                    id: el.id || null,
                    placeholder: el.placeholder || null,
                    aria_label: el.getAttribute('aria-label') || null,
                    classes: typeof el.className === 'string' ? el.className : null,
                    contenteditable: el.contentEditable === 'true',
                });
            });
            return inputs;
        }
        """
    )


async def scan_buttons(page: Page) -> list[dict]:
    """Scan tất cả button visible trên page."""
    return await page.evaluate(
        """
        () => {
            const buttons = [];
            document.querySelectorAll('button, input[type="submit"], a[role="button"]').forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                buttons.push({
                    tag: el.tagName.toLowerCase(),
                    type: el.type || null,
                    text: (el.textContent || el.value || '').trim().slice(0, 80),
                    id: el.id || null,
                    classes: typeof el.className === 'string' ? el.className : null,
                    aria_label: el.getAttribute('aria-label') || null,
                });
            });
            return buttons;
        }
        """
    )


async def detect_editor_type(page: Page) -> str:
    """Detect loại rich editor phổ biến."""
    return await page.evaluate(
        """
        () => {
            if (document.querySelector('iframe.tox-edit-area__iframe, iframe.mce-edit-area')) return 'tinymce';
            if (document.querySelector('.ql-editor')) return 'quill';
            if (document.querySelector('.DraftEditor-root')) return 'draft';
            if (document.querySelector('.cm-editor, .CodeMirror')) return 'codemirror';
            if (document.querySelector('textarea[name="content"], textarea[name="body"], textarea')) return 'textarea';
            if (document.querySelector('[contenteditable="true"]')) return 'contenteditable';
            return 'unknown';
        }
        """
    )


def to_selector(element: dict | None) -> str | None:
    if not element:
        return None
    if element.get("id"):
        return f"#{element['id']}"
    if element.get("name"):
        return f"[name='{element['name']}']"
    if element.get("type") and element.get("tag") == "input":
        return f"input[type='{element['type']}']"
    return element.get("tag")


def smart_pick_selector(inputs: list[dict], buttons: list[dict], target: str) -> str | None:
    """
    Heuristic chọn selector đúng cho target.
    """
    if target == "title":
        keywords = ["title", "tiêu đề", "tieude", "headline", "subject"]
        for item in inputs:
            for keyword in keywords:
                for attr in [item.get("name"), item.get("id"), item.get("placeholder"), item.get("aria_label")]:
                    if attr and keyword.lower() in attr.lower():
                        return to_selector(item)
        for item in inputs:
            if item.get("type") == "text" or item.get("tag") == "input":
                return to_selector(item)

    if target == "publish":
        keywords = ["publish", "đăng", "xuất bản", "post", "submit", "save"]
        skip_keywords = ["draft", "lưu nháp", "preview"]
        for item in buttons:
            text = (item.get("text") or "").lower()
            if any(skip in text for skip in skip_keywords):
                continue
            for keyword in keywords:
                if keyword in text:
                    if item.get("id"):
                        return f"#{item['id']}"
                    if item.get("text"):
                        return f'button:has-text("{item["text"]}")'
        return None

    return None


async def main() -> None:
    if not (settings.azdag_login_url and settings.azdag_email and settings.azdag_password):
        print("❌ Thiếu AZDAG_LOGIN_URL / AZDAG_EMAIL / AZDAG_PASSWORD trong .env")
        raise SystemExit(1)

    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    selectors: dict = {
        "azdag_url": settings.azdag_url,
        "azdag_login_url": settings.azdag_login_url,
        "discovered_at": None,
        "login": {},
        "new_post": {},
        "success_detection": {},
    }

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False, slow_mo=300)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            print("\n📍 PHASE A: Inspecting LOGIN page...")
            await page.goto(settings.azdag_login_url, wait_until="domcontentloaded")
            await asyncio.sleep(2)

            await page.screenshot(path=str(SCREENSHOTS_DIR / "01_login_page.png"))
            login_inputs = await scan_form_inputs(page)
            login_buttons = await scan_buttons(page)

            print("\n🔍 Login page inputs detected:")
            for index, item in enumerate(login_inputs):
                print(
                    f"  [{index}] tag={item['tag']} type={item['type']} "
                    f"name={item['name']} id={item['id']} placeholder={item['placeholder']}"
                )

            print("\n🔍 Login page buttons detected:")
            for index, item in enumerate(login_buttons):
                print(f"  [{index}] text='{item['text']}' id={item['id']}")

            email_input = next(
                (
                    item
                    for item in login_inputs
                    if item.get("type") == "email"
                    or (item.get("name") and "email" in item["name"].lower())
                    or (item.get("name") and "user" in item["name"].lower())
                ),
                None,
            )
            password_input = next((item for item in login_inputs if item.get("type") == "password"), None)
            submit_button = next(
                (
                    item
                    for item in login_buttons
                    if item.get("type") == "submit"
                    or any(keyword in (item.get("text") or "").lower() for keyword in ["login", "đăng nhập", "sign in"])
                ),
                None,
            )

            selectors["login"]["email"] = to_selector(email_input)
            selectors["login"]["password"] = to_selector(password_input)
            selectors["login"]["submit"] = (
                f"#{submit_button['id']}"
                if submit_button and submit_button.get("id")
                else f'button:has-text("{submit_button["text"]}")'
                if submit_button and submit_button.get("text")
                else None
            )

            print("\n✅ Detected login selectors:")
            print(f"   email:    {selectors['login']['email']}")
            print(f"   password: {selectors['login']['password']}")
            print(f"   submit:   {selectors['login']['submit']}")

            await prompt_user("Verify selectors login ổn không? (Xem ảnh logs/azdag_inspect/01_login_page.png nếu cần)")

            await page.fill(selectors["login"]["email"], settings.azdag_email)
            await page.fill(selectors["login"]["password"], settings.azdag_password)
            await page.click(selectors["login"]["submit"])

            print("\n📍 PHASE B: Đợi 5s xem có chuyển sang OTP không...")
            await asyncio.sleep(5)

            current_url = page.url
            print(f"   Current URL: {current_url}")
            await page.screenshot(path=str(SCREENSHOTS_DIR / "02_after_login_submit.png"))

            after_inputs = await scan_form_inputs(page)
            otp_candidates = [
                item
                for item in after_inputs
                if any(
                    keyword in str(item.get(attr) or "").lower()
                    for attr in ["name", "id", "placeholder", "aria_label"]
                    for keyword in ["otp", "code", "verify", "xác nhận", "mã"]
                )
            ]

            if otp_candidates:
                otp_input = otp_candidates[0]
                selectors["login"]["otp"] = to_selector(otp_input)
                print(f"\n✅ Detected OTP input: {selectors['login']['otp']}")

                otp_buttons = await scan_buttons(page)
                otp_submit = next(
                    (
                        item
                        for item in otp_buttons
                        if item.get("type") == "submit"
                        or any(
                            keyword in (item.get("text") or "").lower()
                            for keyword in ["verify", "xác nhận", "submit", "tiếp tục"]
                        )
                    ),
                    None,
                )
                if otp_submit:
                    selectors["login"]["otp_submit"] = (
                        f"#{otp_submit['id']}"
                        if otp_submit.get("id")
                        else f'button:has-text("{otp_submit["text"]}")'
                    )

                print("\n📧 BÂY GIỜ ANH MỞ EMAIL LẤY OTP, NHẬP VÀO BROWSER (visible).")
                await prompt_user("Đã login xong chưa? Bấm ENTER sau khi đã thấy dashboard")
            else:
                print("\n   Không thấy OTP page (có thể login thẳng vào dashboard).")
                await prompt_user("Verify đã ở dashboard chưa? Bấm ENTER tiếp tục")

            dashboard_url = page.url
            print(f"\n📍 PHASE C: Dashboard URL: {dashboard_url}")
            await page.screenshot(path=str(SCREENSHOTS_DIR / "03_dashboard.png"))

            print("\n👉 BÂY GIỜ ANH CLICK TỚI TRANG 'ĐĂNG BÀI MỚI' BẰNG TAY trên browser.")
            print("   Hoặc paste URL vào address bar nếu anh biết sẵn.")
            await prompt_user("Đã ở trang đăng bài mới chưa? Bấm ENTER")

            new_post_url = page.url
            selectors["new_post"]["url"] = new_post_url
            print(f"\n   New post URL: {new_post_url}")

            await asyncio.sleep(2)
            await page.screenshot(path=str(SCREENSHOTS_DIR / "04_new_post_page.png"))

            print("\n📍 PHASE D: Inspecting NEW POST page...")
            new_post_inputs = await scan_form_inputs(page)
            new_post_buttons = await scan_buttons(page)
            editor_type = await detect_editor_type(page)

            print(f"\n🔍 Editor type detected: {editor_type}")
            print("\n🔍 Inputs:")
            for index, item in enumerate(new_post_inputs):
                print(f"  [{index}] {item}")
            print("\n🔍 Buttons:")
            for index, item in enumerate(new_post_buttons):
                print(f"  [{index}] text='{item['text']}' id={item['id']}")

            selectors["new_post"]["editor_type"] = editor_type
            selectors["new_post"]["title"] = smart_pick_selector(new_post_inputs, new_post_buttons, "title")
            selectors["new_post"]["publish"] = smart_pick_selector(new_post_inputs, new_post_buttons, "publish")

            if editor_type == "tinymce":
                selectors["new_post"]["content_iframe"] = "iframe.tox-edit-area__iframe, iframe.mce-edit-area"
                selectors["new_post"]["content"] = "body"
            elif editor_type == "quill":
                selectors["new_post"]["content"] = ".ql-editor"
            elif editor_type == "textarea":
                textarea = next(
                    (
                        item
                        for item in new_post_inputs
                        if item["tag"] == "textarea"
                        and (
                            item.get("name") in ["content", "body"]
                            or "content" in str(item.get("id") or "")
                        )
                    ),
                    None,
                )
                selectors["new_post"]["content"] = to_selector(textarea) if textarea else "textarea"
            elif editor_type == "contenteditable":
                selectors["new_post"]["content"] = "[contenteditable='true']"

            print("\n✅ Detected new post selectors:")
            print(f"   title:        {selectors['new_post'].get('title')}")
            print(f"   editor_type:  {selectors['new_post'].get('editor_type')}")
            print(f"   content:      {selectors['new_post'].get('content')}")
            print(f"   publish:      {selectors['new_post'].get('publish')}")

            await prompt_user("Verify selectors trên. Nếu sai, anh báo Codex chỉnh tay sau.")

            print("\n📍 PHASE E: Inspect mode dừng ở đây, chưa publish live.")
            print("   Sau bước này anh chạy tests/phase10_azdag_test.py để verify publish thật.")

            selectors["discovered_at"] = datetime.now(timezone.utc).isoformat()
            with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
                yaml.dump(selectors, file, allow_unicode=True, sort_keys=False)
            print(f"\n✅ Đã save selectors vào: {OUTPUT_FILE}")

            raw_dump = SCREENSHOTS_DIR / "raw_scan.json"
            with open(raw_dump, "w", encoding="utf-8") as file:
                json.dump(
                    {
                        "login_inputs": login_inputs,
                        "login_buttons": login_buttons,
                        "new_post_inputs": new_post_inputs,
                        "new_post_buttons": new_post_buttons,
                    },
                    file,
                    indent=2,
                    ensure_ascii=False,
                )
            print(f"✅ Raw scan dump: {raw_dump}")
        finally:
            await prompt_user("Bấm ENTER để đóng browser")
            await context.close()
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

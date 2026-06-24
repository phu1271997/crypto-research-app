# AZDAG Workflow Documentation

## Khi nào cần re-run `azdag_inspect.py`?

1. Lần đầu setup, khi chưa có file `docs/azdag_selectors.yaml`
2. AZDAG đổi UI và bot fail với lỗi kiểu `selector not found`
3. Sau một đợt update lớn của dashboard, để verify lại selector và editor type

## Cách re-run

```bash
caffeinate -d -t 1200 &
DEBUG_PLAYWRIGHT=true python scripts/azdag_inspect.py
```

Tool sẽ:

1. Mở Chromium visible
2. Tự điền email + password AZDAG
3. Đợi anh nhập OTP trong browser nếu site yêu cầu
4. Đợi anh tự mở tới trang đăng bài mới
5. Tự scan DOM và đoán selector cho:
   - login email
   - login password
   - OTP
   - title
   - content
   - publish
6. Save vào `docs/azdag_selectors.yaml`

## Output cần kiểm tra

Sau khi chạy xong, verify file `docs/azdag_selectors.yaml`:

- `login.email` không null
- `login.password` không null
- `new_post.url` không null
- `new_post.title` không null
- `new_post.editor_type` nằm trong một trong các giá trị:
  - `tinymce`
  - `quill`
  - `textarea`
  - `contenteditable`
- `new_post.publish` không null

Nếu có field quan trọng bị null:

1. Mở `logs/azdag_inspect/raw_scan.json`
2. Tìm element thật mà tool detect được
3. Sửa tay file `docs/azdag_selectors.yaml`
4. Chạy lại `tests/phase10_azdag_test.py`

## Logs hữu ích

- Screenshot login page:
  - `logs/azdag_inspect/01_login_page.png`
- Screenshot sau submit login:
  - `logs/azdag_inspect/02_after_login_submit.png`
- Screenshot dashboard:
  - `logs/azdag_inspect/03_dashboard.png`
- Screenshot trang đăng bài:
  - `logs/azdag_inspect/04_new_post_page.png`
- Raw dump DOM scan:
  - `logs/azdag_inspect/raw_scan.json`

## Verify publish thật

Sau khi có selector ổn:

```bash
DEBUG_PLAYWRIGHT=false python tests/phase10_azdag_test.py
```

Nếu session local còn sống:

- browser sẽ chạy headless
- không cần nhập OTP
- bài test sẽ đăng trực tiếp

## Khi AZDAG đổi UI

Workflow đề xuất:

1. Re-run `scripts/azdag_inspect.py`
2. So sánh `docs/azdag_selectors.yaml`
3. Nếu editor type đổi, verify lại `src/publishers/azdag.py` có support editor đó chưa
4. Chạy `tests/phase10_azdag_test.py`
5. Nếu ổn mới test full flow Telegram

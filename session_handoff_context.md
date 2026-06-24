# Primus Research AI & Bot Integration - Session Handoff Context

Tài liệu này lưu trữ toàn bộ trạng thái kiến trúc, hạ tầng, cơ sở dữ liệu, các tệp nguồn và chi tiết kỹ thuật mới nhất của dự án **Primus Research AI** tính đến ngày **24/06/2026**. Bất kỳ hệ thống AI hay lập trình viên nào tiếp quản tài liệu này đều có thể hiểu ngay lập tức mô hình dự án và tiếp tục phát triển mà không gặp trở ngại.

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

Hệ thống hoạt động theo mô hình **DB-as-command-queue** (hàng đợi lệnh thông qua cơ sở dữ liệu) với cơ chế **outbound-only polling** (quét một chiều chủ động từ VPS ra ngoài) nhằm tối ưu hóa bảo mật cho server:

```mermaid
graph TD
    subgraph Client & Frontend (Next.js on Vercel)
        A[Dashboard /research] -->|1. Yêu cầu Research/Scan| B(Server Actions /actions.ts)
        E[Dashboard /social-scan] -->|1. Yêu cầu Research/Scan| B
        C[Database / Neon PostgreSQL] <-->|2. Lưu trữ lệnh & Đọc kết quả| B
    end

    subgraph Backend & Publisher (Python Bot on VPS)
        D[Bốp-Worker / bop_worker.py] <-->|3. Quét lệnh pending & trả kết quả| C
        F[Dang-bai-X-bot / main.py] <-->|3. Quét lệnh pending & trả kết quả| C
        G[Hermes CLI / Agent Bốp] <-->|4. Thực thi quét/phân tích sâu| D
    end
```

### Các thành phần chính:
1.  **Frontend (Next.js App Router)**: Giao diện quản trị viên Cyberpunk hỗ trợ chuyển đổi giao diện Sáng/Tối, thực hiện cào web thô và giao tiếp với database qua Server Actions.
2.  **Database Engine (Neon PostgreSQL)**: Cơ sở dữ liệu serverless trung gian. Có cơ chế tự động chuyển đổi sang database JSON cục bộ (`.local_db/`) nếu thiếu biến môi trường chạy local.
3.  **Python Bot & AI Agents (VPS-hosted)**: Đặt tại VPS, chạy liên tục để quét bảng `bot_commands`, thực hiện nghiên cứu chuyên sâu, quét mạng xã hội (qua AI Agent Bốp bằng Hermes CLI cục bộ) và tự động viết/đăng bài viết lên WordPress/X.

---

## 2. THÔNG TIN HẠ TẦNG & THÔNG TIN ĐĂNG NHẬP (INFRASTRUCTURE & CREDENTIALS)

### VPS (Máy chủ lưu trữ Bot & AI Agent)
*   **IP Address**: `36.50.55.21` (Port: `22`, User: `root`)
*   **Thư mục làm việc**: `/opt/Dang-bai-X-bot`
*   **Python Virtualenv**: `/opt/Dang-bai-X-bot/venv/bin/python`
*   **Hệ điều hành**: Ubuntu 22.04 LTS
*   **Các tiến trình PM2 đang hoạt động**:
    *   `Dang-bai-X-bot` (ID: `3`): Chạy file `main.py` để xử lý việc viết bài và xuất bản lên WordPress/X.
    *   `Bốp-Worker` (ID: `7`): Chạy file `src/bop_worker.py` để xử lý các lệnh `RESEARCH` và `SOCIAL_SCAN` qua Hermes CLI.
    *   `Bốp-Hermes` (ID: `2`): Chạy tác vụ bổ trợ của Agent Bốp.
    *   `hermes-gateway` (ID: `6`): Cổng giao tiếp nội bộ cho Hermes Agent.

### Cơ sở dữ liệu (Neon PostgreSQL)
*   **Kết nối**: Kết nối trực tiếp qua `DATABASE_URL`.
*   **Lưu ý kỹ thuật quan trọng**: Nhằm tránh lỗi driver PostgreSQL crash khi chạy các truy vấn chuẩn hóa (prepared statements) qua cổng kết nối Pool của Neon PgBouncer, các kết nối trên VPS và Frontend đều được cấu hình tham số `connect_args={"prepare_threshold": None}` (Python) hoặc tự động loại bỏ các lệnh prepared cache.

---

## 3. THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

Cơ chế điều khiển và chia sẻ trạng thái giữa Web App và VPS Bot được cấu trúc qua 6 bảng chính trong cơ sở dữ liệu:

1.  **`projects`**: Danh sách dự án đã được nghiên cứu và chấm điểm.
    *   *Trường dữ liệu*: `id` (UUID), `name`, `website`, `total_score` (điểm tổng 100), `recommendation` (Khuyến nghị đầu tư), `scores` (JSON chứa điểm 8 hạng mục kèm lý do và mức tin cậy), `summary`, `detailed_assessment` (bản đánh giá chi tiết kiểu memo nội bộ IC), `strengths`, `risks`, `red_flags`, `questions_for_founder`, `raw_input`, `auto_scan` (BOOLEAN - tự động scan định kỳ), `created_at`.
2.  **`bot_commands`**: Hàng đợi các lệnh gửi từ giao diện Web đến VPS Bot.
    *   *Trường dữ liệu*: `id` (SERIAL), `type` (`GENERATE`, `PUBLISH`, `REGENERATE_THREAD`, `REGENERATE_IMAGES`, `REGENERATE_ALL`, `CANCEL`, `TRENDING`, `RESEARCH`, `SOCIAL_SCAN`), `payload` (JSON), `status` (`pending`, `processing`, `done`, `failed`), `error` (TEXT), `created_at`, `updated_at`.
3.  **`bot_status`**: Lưu trữ trạng thái online (heartbeat), uptime và cấu hình gợi ý tin tức nóng (`trending_topics`) của VPS Bot.
4.  **`draft_articles`**: Các bản thảo bài viết do AI viết đang chờ quản trị viên duyệt để đăng.
5.  **`recent_articles`**: Nhật ký liên kết các bài viết đã xuất bản thành công lên WordPress và mạng xã hội X.
6.  **`scan_reports` (Bảng mới tạo)**: Lưu trữ lịch sử các báo cáo quét (scan) mạng xã hội của dự án.
    *   *Trường dữ liệu*: `id` (UUID), `project_id` (UUID), `scanned_at` (TIMESTAMP), `payload` (JSON chứa chi tiết các kênh Twitter/Telegram/Discord/GitHub, tóm tắt hoạt động, các tín hiệu tích cực, Red Flags và chỉ số Momentum), `status`, `error`, `created_at`.

---

## 4. CHI TIẾT CÁC TÍNH NĂNG CỐT LÕI ĐÃ TÍCH HỢP

### 4.1. Tích hợp AI Agent Bốp vào "Research Dự Án"
*   **Vị trí giao diện**: Trang `/research` (Mặc định chọn Bốp).
*   **Luồng hoạt động**:
    1.  Người dùng nhập URL dự án và bấm **Phân tích**. Giao diện hiển thị các bước chờ trực quan.
    2.  Next.js gọi Server Action cào nội dung website thô thông qua `scrapeWebsite`.
    3.  Hệ thống tạo lệnh `RESEARCH` mới trong bảng `bot_commands`.
    4.  Tiến trình `Bốp-Worker` trên VPS nhận lệnh, truyền dữ liệu cào vào **Hermes CLI** (`/root/.hermes/hermes-agent/venv/bin/hermes`) để phân tích sâu bằng Agent Bốp.
    5.  Agent Bốp trả về kết quả JSON chuẩn hóa. Worker trên VPS lưu kết quả vào trường `payload.result` của lệnh và đánh dấu `done`.
    6.  Frontend Next.js liên tục quét (poll) database mỗi 3 giây. Khi hoàn tất, nó sẽ lấy kết quả JSON, đi qua bộ chuẩn hóa `cleanAndNormalizeProjectScores` (tái chuẩn hóa điểm tổng về thang 100 nếu thiếu Tokenomics hoặc Deal terms) và lưu vào bảng `projects`.

### 4.2. Tính năng lớn: "Scan" (Quét xung lực mạng xã hội)
*   **Vị trí giao diện**: Trang `/social-scan` (Tab **Scan** trên Navbar).
*   **Luồng hoạt động**:
    1.  Trang hiển thị toàn bộ dự án đang có trong **Watchlist** ở cột bên trái kèm bộ lọc tìm kiếm.
    2.  Người dùng có thể chọn một hoặc nhiều dự án và bấm **Khởi Chạy Scan**.
    3.  Hệ thống tạo lệnh `SOCIAL_SCAN` trong bảng `bot_commands` kèm danh sách dự án cần quét.
    4.  `Bốp-Worker` tiếp nhận, quét các kênh mạng xã hội (Twitter/X, Telegram, Discord, GitHub) của từng dự án trong 7 ngày qua thông qua Agent Bốp.
    5.  Báo cáo chi tiết dạng JSON được ghi trực tiếp vào bảng `scan_reports`.
    6.  Giao diện Web hiển thị báo cáo cực kỳ trực quan ở cột bên phải:
        *   *Momentum*: Nhãn trạng thái màu sắc (*Bứt Phá*, *Ổn Định*, *Chậm Lại*, *Tạm Ngưng*).
        *   *Thông số các kênh*: Grid card chi tiết cho từng platform hiển thị lượng followers, post count, delta tăng trưởng tuần và nhận xét tương tác.
        *   *Tín hiệu tích cực & Red Flags*: Danh sách điểm sáng và cảnh báo nguy hiểm trực quan.
        *   *Lịch sử*: Hỗ trợ xem lại toàn bộ các báo cáo cũ theo ngày tháng.

### 4.3. Vô hiệu hóa Cron tự động quét tin hot (Trending Job)
*   **Chỉnh sửa**: Tắt cron job tự động `trending_job` định kỳ trong tệp [scheduler.py](file:///Users/peter/Downloads/AI/primus-research/vps/Dang-bai-X-bot/src/scheduler.py) trên VPS để tối ưu hóa tài nguyên máy chủ.
*   **Kết quả**: Tính năng lấy tin hot đổi hoàn toàn sang cơ chế kích hoạt thủ công bằng nút **"Quét Tin Hot"** trên giao diện Web Admin để người dùng kiểm soát 100% thời điểm quét.

---

## 5. BẢN ĐỒ MÃ NGUỒN (CODEBASE FILE MAP)

### Frontend (Next.js Web App)
*   [src/lib/db.ts](file:///Users/peter/Downloads/AI/primus-research/src/lib/db.ts): Module database chính. Quản lý kết nối, auto-migration tạo bảng `scan_reports`, định nghĩa kiểu dữ liệu `ScanReport`, và các hàm hỗ trợ lưu/truy vấn.
*   [src/app/actions.ts](file:///Users/peter/Downloads/AI/primus-research/src/app/actions.ts): Server Actions giao tiếp trực tiếp giữa client và database, bao gồm luồng gửi lệnh `RESEARCH`, `SOCIAL_SCAN` và kiểm tra trạng thái lệnh.
*   [src/app/components/Navbar.tsx](file:///Users/peter/Downloads/AI/primus-research/src/app/components/Navbar.tsx): Thanh điều hướng chính tích hợp tab **Scan**.
*   [src/app/social-scan/page.tsx](file:///Users/peter/Downloads/AI/primus-research/src/app/social-scan/page.tsx): Cổng truy cập Server Component cho trang Scan.
*   [src/app/components/SocialScanClient.tsx](file:///Users/peter/Downloads/AI/primus-research/src/app/components/SocialScanClient.tsx): Giao diện tương tác Client Component của trang Scan.
*   [src/app/components/ResearchPageClient.tsx](file:///Users/peter/Downloads/AI/primus-research/src/app/components/ResearchPageClient.tsx): Giao diện trang Research tích hợp lựa chọn Agent Bốp làm mặc định.
*   [src/context/ResearchContext.tsx](file:///Users/peter/Downloads/AI/primus-research/src/context/ResearchContext.tsx): Context quản lý trạng thái nghiên cứu toàn cục của ứng dụng.

### Backend (VPS Python Bot - `/opt/Dang-bai-X-bot`)
*   `main.py`: Khởi chạy bot, nạp biến môi trường và chạy các luồng xử lý đồng thời.
*   `src/bop_worker.py`: Tiến trình chạy nền quét lệnh `RESEARCH` và `SOCIAL_SCAN` từ database, thực thi thông qua Hermes CLI, trích xuất kết quả JSON và cập nhật ngược lại cơ sở dữ liệu.
*   `src/scheduler.py`: Bộ lập lịch cron job chạy nền (Đã tắt job tự động lấy tin hot theo yêu cầu).
*   `src/db.py`: Cấu hình kết nối PostgreSQL qua SQLAlchemy cho Bot.

---

## 6. HƯỚNG DẪN VẬN HÀNH VPS (VPS OPERATIONS)

Khi cần bảo trì hoặc kiểm tra trạng thái bot trên VPS (`36.50.55.21`), hãy sử dụng các lệnh SSH sau:

*   **Xem danh sách các tiến trình**:
    ```bash
    pm2 list
    ```
*   **Xem logs hoạt động của Bot**:
    ```bash
    pm2 logs Dang-bai-X-bot
    ```
    hoặc xem logs của Bốp Worker:
    ```bash
    pm2 logs Bốp-Worker
    ```
*   **Xem logs trực tiếp từ file**:
    ```bash
    tail -n 100 /opt/Dang-bai-X-bot/logs/bot.log
    ```
*   **Khởi động lại Bot để cập nhật cấu hình**:
    ```bash
    pm2 restart Dang-bai-X-bot
    ```
*   **Kiểm tra tính biên dịch không lỗi của mã nguồn Python**:
    ```bash
    /opt/Dang-bai-X-bot/venv/bin/python -m py_compile /opt/Dang-bai-X-bot/src/scheduler.py
    ```

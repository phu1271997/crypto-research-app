# Primus Research AI & Bot Integration - Session Handoff Context
This document serves as the complete state representation of the development session for **Primus Research AI** and its integration with the **Dang-bai-X-bot** publisher bot. If you are a new AI agent resuming work, reading this file will provide you with the exact context, credentials, codebase modifications, database states, and next steps.

---

## 1. Executive Summary & Current Status
We have successfully integrated the Next.js Vercel Web Dashboard with the VPS-hosted Python Bot via a **DB-as-command-queue** architecture.

- **Frontend App URL**: [https://crypto-research-app.vercel.app/admin](https://crypto-research-app.vercel.app/admin)
- **Local Workspace**: `/Users/peter/AI/AI-research`
- **Main Goal**: Control the Python publisher bot directly from the Web Admin dashboard using outbound-only polling from the VPS to protect internal systems.
- **Current State**: All integration code is written, compiled, and deployed. The dashboard supports dark/light mode, trending topic rendering (9 items in a custom grid), customizable publishing targets (Primus Spark / AZDAG), publishing format triggers (Thread vs X Article), long tweet limits (4000 chars), and self-healing worker loops.

---

## 2. Infrastructure & Credentials

### VPS Connection (Host for Python Bot)
- **IP Address**: `36.50.55.21`
- **User**: `root`
- **Port**: `22`
- **Working Directory**: `/opt/Dang-bai-X-bot`
- **Python Virtualenv**: `/opt/Dang-bai-X-bot/venv/bin/python`
- **PM2 Process Name**: `Dang-bai-X-bot` (PM2 ID: `11`)
- **App Log File**: `/opt/Dang-bai-X-bot/logs/bot.log`

### Database Engine (Neon PostgreSQL)
- Connected to a serverless Postgres instance on Neon.
- **Critical PgBouncer Fix**: Direct Neon connection poolers crash on driver prepared statements. The SQLAlchemy connection engine on the VPS is configured with `connect_args={"prepare_threshold": None}` for `psycopg3` compatibility.
- **Web App Config**: If `DATABASE_URL` is missing in the environment, the Next.js app falls back to local JSON databases stored in `.local_db/`.

---

## 3. Database Schema Overview
Communication is coordinated through 5 main database tables:

1. **`projects`**: Watchlist for evaluated crypto venture projects (100-point scale).
2. **`bot_commands`**: Commands sent from Web Admin to VPS Bot.
   - Fields: `id` (Auto-increment), `type` (`GENERATE`, `PUBLISH`, `REGENERATE_THREAD`, `REGENERATE_IMAGES`, `REGENERATE_ALL`, `CANCEL`, `TRENDING`), `payload` (JSON), `status` (`pending`, `processing`, `done`, `failed`), `error` (Text), `created_at`, `updated_at`.
3. **`bot_status`**: Online heartbeat & configuration reporting.
   - Fields: `id` (1), `last_seen` (timestamp), `uptime` (seconds), `status` (`idle`, `working`), `config` (JSON storing active model names and the parsed `trending_topics` list).
4. **`draft_articles`**: Articles written by AI waiting for human review.
   - Fields: `id` (UUID), `topic` (Text), `status` (`draft`, `editing`, `approved`, `publishing`, `published`, `failed`), `version` (Integer - used for Optimistic Locking), `payload` (JSON containing title, content, tweets, images, and meta configurations), `error`, `created_at`, `updated_at`.
5. **`recent_articles`**: History of successfully published articles.
   - Fields: `id` (Auto-increment), `title`, `slug`, `primus_url`, `azdag_url`, `x1_url` (Primus X link), `x2_url` (AZDAG X link), `created_at`.

---

## 4. Key Implementations in this Session

### 1. Advanced Web Admin Options (`src/app/admin/page.tsx`)
- **Target Platform Selection**: Toggle publication between **Primus Spark** and **AZDAG**.
- **Publish Mode Selection**: Choose to publish to **Both (Web & X)**, **Web Only**, or **X Only**.
- **X Format Selection**: Select between **Twitter Thread** and **X Article (Long Form)**.
- **Tick Xanh Support**: Extended the Tweet card edit text limit to **4000 characters** (from 280) to support long tweets on verified accounts.
- These configs are saved inside the `payload.meta` block of the `DraftArticle` and fetched on draft edit selection.

### 2. Suggested Topics & Manual Trending (`src/app/admin/page.tsx` & `/opt/Dang-bai-X-bot/src/scheduler.py`)
- **9-Topic Grid Layout**: The Suggested Topics layout was restructured into a large, easy-to-read responsive Grid panel instead of a small box, showing topic names, RSS sources, and reasons.
- The `config.yaml` on the VPS was updated to request exactly `num_topics: 9`.
- **"Quét Tin Hot" Button**: Dispatches a `TRENDING` command instantly to trigger RSS scanning without waiting for the cron schedule.

### 3. Client-Side Theme Switcher (`src/app/components/Navbar.tsx`)
- Added a Sun/Moon icon toggle to switch between **Dark** and **Light** themes.
- Preference is cached in browser `localStorage`.
- Added CSS variables and overrides in [src/app/globals.css](file:///Users/peter/AI/AI-research/src/app/globals.css) to support clean background colors, inputs, cards, and text in light mode. Escaped Tailwind v4 special characters to avoid build compiler warnings.

### 4. VPS Bot Resiliency & Heartbeat Fixes (`/opt/Dang-bai-X-bot/src/worker.py`)
- **Self-Healing Startup**: On start, the bot scans `bot_commands` and automatically resets stuck `processing` commands (left over from crashes or sudden restarts) to `failed` so the worker doesn't get blocked.
- **Heartbeat Config Preservation**: The heartbeat loop updates uptime and settings using python dictionary `.update()` instead of complete overwrites, preventing the deletion of the `trending_topics` list generated by the scraper/scheduler.

---

## 5. Codebase File Map

### Web App Files (Next.js)
- [src/lib/db.ts](file:///Users/peter/AI/AI-research/src/lib/db.ts): Main database connector mapping queries for both Postgres and JSON file fallbacks.
- [src/app/actions/admin.ts](file:///Users/peter/AI/AI-research/src/app/actions/admin.ts): Server Actions exposing bot management and draft updates to the frontend.
- [src/app/admin/page.tsx](file:///Users/peter/AI/AI-research/src/app/admin/page.tsx): Cyberpunk control panel UI. Handles live polling, Suggested Topics grid, generated outputs editing, and platform selectors.
- [src/app/components/Navbar.tsx](file:///Users/peter/AI/AI-research/src/app/components/Navbar.tsx): Nav menu featuring client-side light/dark theme switch.
- [src/app/globals.css](file:///Users/peter/AI/AI-research/src/app/globals.css): Custom CSS variables, scrollbars, and light mode styling.

### VPS Python Bot Files
*Note: Local backup scratch files of these scripts are stored in the active brain workspace directory.*
- `/opt/Dang-bai-X-bot/src/db.py`: SQLAlchemy setup & engine creation. Local copy: [vps_db.py](file:///Users/peter/.gemini/antigravity/brain/0c37f27e-ddea-436e-b742-eb562096b0f0/scratch/vps_db.py)
- `/opt/Dang-bai-X-bot/src/worker.py`: Async task loop polling database commands and writing heartbeats. Local copy: [vps_worker.py](file:///Users/peter/.gemini/antigravity/brain/0c37f27e-ddea-436e-b742-eb562096b0f0/scratch/vps_worker.py)
- `/opt/Dang-bai-X-bot/src/scheduler.py`: Cron triggers for trending RSS updates. Local copy: [vps_scheduler.py](file:///Users/peter/.gemini/antigravity/brain/0c37f27e-ddea-436e-b742-eb562096b0f0/scratch/vps_scheduler.py)
- `/opt/Dang-bai-X-bot/main.py`: Main entrypoint orchestrating worker and heartbeat threads. Local copy: [vps_main.py](file:///Users/peter/.gemini/antigravity/brain/0c37f27e-ddea-436e-b742-eb562096b0f0/scratch/vps_main.py)
- `/opt/Dang-bai-X-bot/config.yaml`: Configuration settings specifying trending limits (`num_topics: 9`).

---

## 6. Verification Status & Build Integrity

### 1. Next.js Build Check
The TypeScript compilation and production packaging built flawlessly:
```bash
npm run build
```
- **Output**: Built `/`, `/admin`, `/list`, `/project/[id]` routes successfully. Zero typescript errors.

### 2. VPS Code Compilations
All modified Python files compile without syntax or import errors inside the virtualenv:
```bash
/opt/Dang-bai-X-bot/venv/bin/python -m py_compile /opt/Dang-bai-X-bot/src/db.py
/opt/Dang-bai-X-bot/venv/bin/python -m py_compile /opt/Dang-bai-X-bot/src/worker.py
/opt/Dang-bai-X-bot/venv/bin/python -m py_compile /opt/Dang-bai-X-bot/src/scheduler.py
/opt/Dang-bai-X-bot/venv/bin/python -m py_compile /opt/Dang-bai-X-bot/main.py
```
- **Output**: 0 failures.

---

## 7. VPS Operation Commands

Use the following SSH commands when maintaining the bot process on the VPS (`36.50.55.21`):

- **Check Process List**: `pm2 list` (Confirm process 11 `Dang-bai-X-bot` is online).
- **Restart Bot (Apply Env/Config changes)**: `pm2 restart Dang-bai-X-bot --update-env`
- **View Live Logs**: `pm2 logs Dang-bai-X-bot`
- **Check Bot logs via File**: `tail -n 100 /opt/Dang-bai-X-bot/logs/bot.log`

---

## 8. Hand-off Action Items (Next Steps)
To completely verify the pipeline in the next session, perform the following validation steps:

1. **Verify Connection Heartbeat**:
   - Access the dashboard at [https://crypto-research-app.vercel.app/admin](https://crypto-research-app.vercel.app/admin).
   - Ensure the Status Panel displays `Đang hoạt động (Online)` with a ticking heartbeat.

2. **Trigger manual RSS Scan**:
   - Click the **Quét Tin Hot (Trending)** button.
   - Verify that a `TRENDING` command enters the queue list, transitions to `processing`, and changes to `done`.
   - Refresh the page and confirm that 9 Suggested Topics are populated in the grid.

3. **Generate a Draft Article**:
   - Click on any of the 9 Suggested Topics in the grid. This action auto-populates the input box at the bottom.
   - Click **Gửi Lệnh GENERATE**.
   - Monitor the command list. Once completed, a new article draft will appear on the left draft panel.

4. **Verify Platform & Format Options**:
   - Select the newly generated draft.
   - Edit the Markdown body or Tweet Thread details.
   - Switch target platform configurations (e.g., set to **AZDAG**, select **Chỉ X (X Only)**, set format to **X Article**).
   - Confirm that saving edits persists these configurations.

5. **Publish to WordPress / X**:
   - Click **Duyệt & Đăng bài**.
   - The status should change to `publishing` then `published`.
   - Check the **Nhật ký phát hành gần đây** panel to verify WordPress URLs and Tweet links.

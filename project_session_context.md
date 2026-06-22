# Primus Research AI - Project Session Context

Tài liệu này là bản handoff đầy đủ cho AI agent/Claude tiếp theo. Mục tiêu là giúp agent hiểu toàn bộ dự án từ đầu đến hiện tại: sản phẩm đang làm gì, kiến trúc ra sao, các file nào quan trọng, data shape thế nào, những quyết định kỹ thuật đã được đưa ra, lịch sử bug đã gặp, và các điểm cần cực kỳ cẩn thận khi sửa tiếp.

Nếu bạn là Claude/AI agent mới đọc file này: hãy đọc kỹ toàn bộ trước khi chỉnh code. Dự án đang có nhiều file mới/chưa commit, vì vậy tuyệt đối không revert hoặc cleanup bừa bãi. Hãy coi trạng thái hiện tại của repo là source of truth.

---

## 1. Thông Tin Tổng Quan

### Tên dự án

**Primus Research AI**

Tên cũ trong README/lịch sử: **Crypto Research & Scoring Web App** hoặc **CryptoResearch AI**.

### Mục tiêu sản phẩm

Ứng dụng web giúp tự động hóa quy trình **crypto venture due diligence** cho các dự án crypto giai đoạn sớm. Người dùng nhập URL website dự án và có thể dán thêm thông tin bổ sung như pitch deck, backers, funding, tokenomics, roadmap. Hệ thống sẽ:

1. Cào nội dung website dự án theo thời gian thực.
2. Gửi nội dung website + thông tin bổ sung vào LLM qua OpenRouter.
3. Yêu cầu LLM dùng web search để kiểm tra thêm team, backers, funding, traction, GitHub, audit, community, tokenomics, valuation.
4. Chấm điểm dự án theo khung VC due diligence 8 hạng mục trên thang 100.
5. Tự động normalize điểm nếu một số mục chưa có dữ liệu và được đánh dấu `null`.
6. Lưu báo cáo vào Postgres hoặc local JSON fallback.
7. Hiển thị báo cáo dạng scorecard, strengths/risks, red flags, câu hỏi cần hỏi founder, recommendation.
8. Cho phép xem lại, tìm kiếm, sắp xếp và xóa các báo cáo đã lưu trong watchlist.

### Đối tượng sử dụng

Người dùng chính là nhà đầu tư/analyst crypto muốn có một báo cáo sàng lọc ban đầu giống memo nội bộ của quỹ VC. Tone của sản phẩm là chuyên nghiệp, thẳng, hoài nghi có chủ đích, không marketing.

### Tech stack hiện tại

- Framework: **Next.js 16.2.6**, App Router.
- Language: **TypeScript** strict mode.
- React: **React 19.2.4**.
- Styling: **Tailwind CSS v4** qua `@tailwindcss/postcss`, custom global CSS.
- Icons: **lucide-react**.
- Scraping: `fetch`, `AbortController`, `cheerio`.
- LLM: **OpenRouter Chat Completions API**.
- Database: **PostgreSQL** qua `pg.Pool`; nếu không có `DATABASE_URL` thì fallback sang file local `.local_db/projects.json`.
- Deployment target: **Vercel**.

### Production/deploy context từ lịch sử

Tài liệu cũ ghi production URL là:

```text
https://crypto-research-app.vercel.app
```

Lệnh deploy/redeploy thường dùng:

```bash
npx vercel --prod --yes
```

Lưu ý: nếu cần kiểm chứng production, phải kiểm tra lại URL/deployment hiện tại vì thông tin deploy có thể đã thay đổi.

---

## 2. Trạng Thái Repo Hiện Tại

Path dự án:

```text
/Users/peter/AI/AI-research
```

Branch hiện tại khi đọc repo:

```text
main
```

Worktree đang có nhiều thay đổi chưa commit:

```text
 M README.md
 M package-lock.json
 M package.json
 M src/app/globals.css
 M src/app/layout.tsx
 M src/app/page.tsx
?? .local_db/
?? project_session_context.md
?? public/primus-logo.svg
?? src/app/actions.ts
?? src/app/components/
?? src/app/list/
?? src/app/project/
?? src/lib/
```

Điều này có nghĩa là các file quan trọng hiện tại phần lớn đang là thay đổi mới/chưa commit. Không được revert. Nếu chỉnh tiếp, hãy chỉnh có chủ đích và giữ nguyên các thay đổi không liên quan.

Local DB hiện tại:

```text
.local_db/projects.json
```

Nội dung khi kiểm tra:

```json
[]
```

Không thấy `.env.local` trong repo tại thời điểm đọc. Chỉ thấy `.env.example`.

---

## 3. Cấu Trúc Thư Mục Quan Trọng

```text
/Users/peter/AI/AI-research
├── README.md
├── project_session_context.md
├── AGENTS.md
├── CLAUDE.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── .env.example
├── .local_db/
│   └── projects.json
├── public/
│   ├── primus-logo.svg
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
└── src/
    ├── app/
    │   ├── actions.ts
    │   ├── favicon.ico
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── components/
    │   │   ├── Navbar.tsx
    │   │   └── ProjectResult.tsx
    │   ├── list/
    │   │   └── page.tsx
    │   └── project/
    │       └── [id]/
    │           └── page.tsx
    └── lib/
        ├── db.ts
        ├── openrouter.ts
        └── scraper.ts
```

---

## 4. Agent Instructions Trong Repo

### `AGENTS.md`

Nội dung quan trọng:

```md
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
```

Ý nghĩa: dự án dùng Next.js 16, có thể có API/convention khác với kiến thức cũ. Nếu sửa các phần liên quan Next 16 như route params, Server Actions, metadata, caching, build behavior, nên đọc docs local trong `node_modules/next/dist/docs/` trước.

### `CLAUDE.md`

Nội dung hiện tại chỉ trỏ sang:

```text
@AGENTS.md
```

Claude cần tuân theo `AGENTS.md`.

---

## 5. Luồng Hoạt Động Chính

Luồng phân tích một dự án từ UI đến DB:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Analyst
    participant Page as src/app/page.tsx
    participant Action as src/app/actions.ts
    participant Scraper as src/lib/scraper.ts
    participant OR as src/lib/openrouter.ts
    participant DB as src/lib/db.ts
    participant Detail as ProjectResult / Watchlist

    User->>Page: Nhập website URL, optional raw input, chọn model
    Page->>Action: analyzeProjectAction(websiteUrl, rawInput, model)
    Action->>Scraper: scrapeWebsite(websiteUrl)
    Scraper-->>Action: scrapedText hoặc fallback note nếu scrape fail
    Action->>OR: researchAndScoreProject(url, scrapedText, rawInput, model)
    OR->>OR: Build system prompt + user prompt + OpenRouter payload
    OR->>OR: Gọi OpenRouter Chat Completions
    OR->>OR: Parse JSON, normalize category score, recalculate totalScore
    OR-->>Action: LLMResponse
    Action->>DB: saveProject(mapped Project fields)
    DB->>DB: ensureTable hoặc local JSON fallback
    DB-->>Action: saved Project có id, created_at
    Action-->>Page: { success: true, data: Project }
    Page->>Detail: Hiển thị ProjectResult
```

Luồng xem lại:

```mermaid
flowchart TD
    A["/list"] --> B["getProjectsAction(search, sortBy)"]
    B --> C["getAllProjects trong db.ts"]
    C --> D["Render bảng watchlist"]
    D --> E["Click row"]
    E --> F["/project/[id]"]
    F --> G["getProjectById(id) trong RSC"]
    G --> H["Render ProjectResult"]
```

---

## 6. Data Model Chính

Interface `Project` nằm ở:

```text
src/lib/db.ts
```

Shape hiện tại:

```ts
export interface Project {
  id: string;
  name: string;
  website: string;
  total_score: number;
  recommendation: string;
  scores: {
    teamFounders: { score: number | null; max: number; reasoning: string; confidence: string };
    marketTiming: { score: number | null; max: number; reasoning: string; confidence: string };
    productProblem: { score: number | null; max: number; reasoning: string; confidence: string };
    techSecurity: { score: number | null; max: number; reasoning: string; confidence: string };
    tractionMetrics: { score: number | null; max: number; reasoning: string; confidence: string };
    businessMoat: { score: number | null; max: number; reasoning: string; confidence: string };
    tokenomics: { score: number | null; max: number; reasoning: string; confidence: string };
    dealValuation: { score: number | null; max: number; reasoning: string; confidence: string };
  };
  summary: string;
  detailed_assessment: string;
  strengths: string[];
  risks: string[];
  red_flags: string[];
  questions_for_founder: string[];
  raw_input?: string;
  created_at?: Date;
}
```

Database schema tương ứng:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  recommendation TEXT NOT NULL,
  scores JSONB NOT NULL,
  summary TEXT NOT NULL,
  detailed_assessment TEXT NOT NULL,
  strengths JSONB NOT NULL,
  risks JSONB NOT NULL,
  red_flags JSONB DEFAULT '[]'::jsonb,
  questions_for_founder JSONB DEFAULT '[]'::jsonb,
  raw_input TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Auto-migration hiện có:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS red_flags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS questions_for_founder JSONB DEFAULT '[]'::jsonb;
```

Nếu thêm cột mới, phải thêm cả vào:

1. `Project` interface.
2. `CREATE TABLE`.
3. `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
4. `saveProject` insert columns/values.
5. `getAllProjects` select/map.
6. `getProjectById` select/map.
7. Local JSON fallback nếu cần.
8. UI components nếu hiển thị.

---

## 7. Bộ Chấm Điểm VC Due Diligence

Dự án đã nâng cấp từ bộ 7 tiêu chí cũ sang bộ **8 tiêu chí VC DD**. Đây là khung hiện tại và phải được giữ đồng bộ giữa prompt, type, normalize logic và UI.

| Key | Hạng mục | Max | Trọng số |
|---|---|---:|---:|
| `teamFounders` | Team & Founders | 10 | 10% |
| `marketTiming` | Thị trường & Timing | 16 | 16% |
| `productProblem` | Sản phẩm & Vấn đề giải quyết | 21 | 21% |
| `techSecurity` | Công nghệ & Bảo mật | 17 | 17% |
| `tractionMetrics` | Traction & Metrics | 14 | 14% |
| `businessMoat` | Mô hình kinh doanh & Moat | 12 | 12% |
| `tokenomics` | Tokenomics | 6 | 6% |
| `dealValuation` | Điều khoản Deal & Định giá | 4 | 4% |

Tổng max: 100.

### Null score / N/A handling

Một số hạng mục, đặc biệt `tokenomics` và `dealValuation`, có thể chưa có dữ liệu ở dự án giai đoạn sớm. Khi đó LLM được yêu cầu trả:

```json
{ "score": null, "max": 6, "reasoning": "N/A - chưa công bố tokenomics chính thức", "confidence": "Thấp" }
```

Không được tự động tính `null` là 0 điểm. Hệ thống phải loại hạng mục đó khỏi mẫu số và normalize lại:

```text
totalScore = round(totalAcquired / totalMaxPossibleForScoredCategories * 100)
```

Ví dụ:

```text
Các mục có dữ liệu đạt 72/90, tokenomics/dealValuation null.
totalScore = round(72 / 90 * 100) = 80
```

### Red flags cần kiểm tra

Prompt hiện yêu cầu LLM gắn cờ nếu có:

- Team ẩn danh không lý do và không có track record kiểm chứng.
- Partnership/backers tự xưng nhưng không xác nhận được.
- Whitepaper/code đạo nhái.
- GitHub chết hoặc contributor giả.
- Metrics vanity, TVL do incentive, wash trading.
- Community bot/mercenary.
- Tokenomics lệch về insider, unlock sớm/lớn.
- Hứa hẹn lợi nhuận phi thực tế.
- Né tránh pháp lý, doanh thu, số liệu cụ thể.
- Rủi ro regulatory chưa xử lý.

---

## 8. File Map Chi Tiết

### `src/app/page.tsx`

Đây là trang chính, chạy client-side (`'use client'`).

Vai trò:

- Render form nhập website URL.
- Render textarea thông tin bổ sung.
- Render dropdown chọn model OpenRouter.
- Gọi `analyzeProjectAction(websiteUrl, rawInput, selectedModel)`.
- Quản lý state loading/error/result.
- Hiển thị loading stepper động.
- Khi success, render `ProjectResult`.
- Có nút "Phân tích dự án khác".

State chính:

```ts
const [websiteUrl, setWebsiteUrl] = useState('');
const [rawInput, setRawInput] = useState('');
const [selectedModel, setSelectedModel] = useState('google/gemini-3-flash-preview:online');
const [isLoading, setIsLoading] = useState(false);
const [loadingStep, setLoadingStep] = useState(0);
const [error, setError] = useState<string | null>(null);
const [result, setResult] = useState<Project | null>(null);
const [savedSuccess, setSavedSuccess] = useState(false);
```

Điểm cần chú ý:

- `OPENROUTER_MODELS` được import từ `@/lib/openrouter`. Vì `page.tsx` là Client Component, file `openrouter.ts` đang bị import vào client bundle để lấy model list. Hiện file đó cũng chứa server-only logic và đọc `process.env`. Nếu Next build cảnh báo/bundle quá nhiều, nên tách `OPENROUTER_MODELS` sang file shared riêng như `src/lib/models.ts`.
- Loading stepper dùng `useEffect` với dependency `[isLoading]` nhưng đọc `loadingSteps` bên trong. Hiện chạy được nhưng eslint/react-hooks có thể nhắc nếu rule strict hơn.
- UI đang dùng nhiều rounded `2xl/3xl` và glassmorphism. Nếu chỉnh frontend, giữ phong cách hiện tại trừ khi user yêu cầu đổi design.

### `src/app/actions.ts`

Server Actions (`'use server'`).

Exports:

```ts
analyzeProjectAction(websiteUrl, rawInputText, model)
getProjectsAction(search, sortBy)
getProjectDetailAction(id)
deleteProjectAction(id)
```

Pattern quan trọng:

```ts
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

Lý do: Next.js production thường sanitize thrown errors trong Server Actions. Vì vậy action trả structured result để UI hiển thị error thật.

Luồng `analyzeProjectAction`:

1. Validate website URL.
2. `scrapeWebsite(websiteUrl)`.
3. `researchAndScoreProject(websiteUrl, scrapedText, rawInputText, model)`.
4. Map `LLMResponse` sang `Project`.
5. `saveProject`.
6. `revalidatePath('/')` và `revalidatePath('/list')`.
7. Return `{ success: true, data: savedProject }`.

Điểm cần chú ý:

- Không đổi action này sang throw trực tiếp trừ khi có lý do rất rõ.
- Khi thêm trường từ LLM response, phải map trong `saveProject`.
- Nếu muốn realtime progress thật, Server Actions hiện chưa stream progress; loading stepper chỉ là UI giả lập.

### `src/lib/scraper.ts`

Vai trò:

- Chuẩn hóa URL: nếu không có `http://` hoặc `https://`, thêm `https://`.
- Fetch website với headers giống browser.
- Timeout 8 giây bằng `AbortController`.
- Dùng `cheerio` remove noise elements:

```text
script, style, noscript, svg, iframe, header, footer, nav, link, meta, select, button
```

- Lấy plain text từ `body`, fallback `html`.
- Collapse whitespace.
- Cắt về tối đa 8000 ký tự.
- Nếu lỗi thì không throw; trả về note tiếng Việt để LLM vẫn tiếp tục research bằng web search.

Important behavior:

```ts
return `[Lưu ý: Không thể tải nội dung trực tiếp từ website dự án. Lý do: ${errorMsg}. Hệ thống sẽ dựa vào dữ liệu web search của LLM và thông tin bạn cung cấp để chấm điểm.]`;
```

Điểm cần chú ý:

- Vì scraper không throw, analysis có thể tiếp tục dù website bị Cloudflare/timeout.
- Nếu cần crawl nhiều trang/docs, scraper hiện mới lấy 1 URL duy nhất, không crawl nội bộ.
- `next: { revalidate: 3600 }` đang được truyền vào fetch. Trong môi trường Server Action/Node có thể ổn với Next fetch, nhưng nếu tách thành script ngoài Next thì cần xem lại.

### `src/lib/openrouter.ts`

Đây là file quan trọng nhất cho LLM.

Exports:

- `LLMResponse`
- `ModelInfo`
- `OPENROUTER_MODELS`
- `researchAndScoreProject`

OpenRouter URL:

```ts
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
```

Env key fallback:

```ts
const apiKey = process.env.OPENROUTER_API_KEY || process.env.Openrouter || process.env.OPENROUTER;
```

Lý do có fallback `Openrouter`: lịch sử deploy Vercel từng cấu hình sai tên biến.

Default model:

```ts
'google/gemini-3-flash-preview:online'
```

Model list hiện tại:

```ts
[
  { id: 'google/gemini-3-flash-preview:online', name: 'Gemini 3.5 Flash Online (Mặc định)' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'tencent/hy3-preview', name: 'Tencent Hunyuan 3 Preview' },
  { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5' },
  { id: 'openai/gpt-5.4', name: 'OpenAI GPT-5.4' },
  { id: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini' },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6' },
  { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus' },
  { id: 'qwen/qwen3.7-max', name: 'Qwen 3.7 Max' }
]
```

Payload behavior:

- Always sends:

```ts
{
  model,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ],
  temperature: 0.2
}
```

- Adds `response_format: { type: 'json_object' }` only if model starts with:

```text
google/
openai/
anthropic/
deepseek/
```

- Adds `plugins: [{ id: 'web' }]` only if model id includes `:online`.

Lý do:

- Tencent/Qwen từng trả empty content khi bị ép JSON response format.
- Web plugin không nên gửi cho model không có suffix `:online`.

JSON extraction:

- `extractJson(text)` trim text.
- Nếu có markdown code block thì bỏ ```json.
- Nếu không, lấy substring từ `{` đầu tiên đến `}` cuối cùng.
- Parse JSON.
- Validate có `projectName`, `scores`, `totalScore`.

Normalize logic:

- `processAndNormalizeResult(content)` gọi `extractJson`.
- Enforce max score theo map:

```ts
{
  teamFounders: 22,
  marketTiming: 16,
  productProblem: 16,
  techSecurity: 13,
  tractionMetrics: 13,
  businessMoat: 10,
  tokenomics: 6,
  dealValuation: 4
}
```

- Convert score numeric.
- Clamp score trong khoảng 0..max.
- Set invalid/N/A/empty thành `null`.
- Nếu category thiếu, thêm fallback:

```ts
{
  score: null,
  max,
  reasoning: 'Không đủ dữ liệu đánh giá hạng mục này.',
  confidence: 'Thấp'
}
```

- Recalculate `totalScore = Math.round((totalAcquired / totalMaxPossible) * 100)`.

Critical known issue:

Trong retry path hiện tại, lần gọi đầu tiên dùng:

```ts
return processAndNormalizeResult(content);
```

Nhưng nếu lần đầu fail và retry lần hai thành công thì code hiện tại dùng:

```ts
return extractJson(content);
```

Điều này bỏ qua normalize/recalculate ở retry success. Nên sửa thành:

```ts
return processAndNormalizeResult(content);
```

Đây là một bug nhỏ nhưng quan trọng vì có thể lưu điểm sai hoặc score vượt max nếu retry path xảy ra.

### `src/lib/db.ts`

Vai trò:

- Định nghĩa `Project`.
- Kết nối PostgreSQL nếu có `DATABASE_URL`.
- Nếu không có DB hoặc init lỗi, fallback local JSON.
- Auto-create table và add missing columns.
- Public API:

```ts
saveProject(project)
getAllProjects(search, sortBy)
getProjectById(id)
deleteProject(id)
```

Postgres setup:

```ts
pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

Local fallback path:

```ts
const localDbPath = path.join(process.cwd(), '.local_db', 'projects.json');
```

Important:

- `process.cwd()` phụ thuộc vào nơi app chạy. Với Next dev/build từ project root thì OK.
- Local fallback dùng sync fs read/write. Đủ cho local/dev, nhưng không phải production serverless storage bền vững.
- Nếu Postgres `ensureTable()` fail, code set `useLocalDb = true` và tạo local DB.

Search/sort:

- Local search filter theo `name` hoặc `website`.
- Postgres search dùng `ILIKE`.
- `sortBy` action-level chỉ nhận `'score' | 'date'`, còn `/list` tự xử lý asc/desc client-side.

### `src/app/components/ProjectResult.tsx`

Vai trò:

- Render toàn bộ báo cáo chi tiết.
- Nhận prop:

```ts
interface ProjectResultProps {
  project: Project;
}
```

Sections:

1. Header overview card: date, name, website, summary, big radial score, recommendation badge.
2. Scorecard table: 8 categories, weight, score/max, confidence, reasoning.
3. Strengths and risks.
4. Red flags.
5. Recommendation + detailed assessment.
6. Questions for founder.

Defensive fallback:

```ts
const getCategoryData = (key: string) => {
  const defaultData = { score: null, max: 0, reasoning: 'Không có dữ liệu.', confidence: 'Thấp' };
  if (!scores) return defaultData;
  return (scores as any)[key] || defaultData;
};
```

Lý do: các report cũ có thể dùng schema 7 tiêu chí, thiếu keys mới. Fallback tránh crash.

Điểm cần chú ý:

- UI dùng bullet Unicode trong list (`•`) và icons Unicode trong Red Flags (`🚩`, `⚠`). Nếu cần giữ ASCII tuyệt đối thì phải thay, nhưng file hiện tại đã dùng Vietnamese/Unicode.
- `getScoreStyles(scorePercent)` cho từng category đang truyền percent thay vì absolute total score, nhưng threshold 80/60 vẫn hợp lý vì scorePercent là 0..100.

### `src/app/list/page.tsx`

Client page cho watchlist.

Vai trò:

- Load projects bằng `getProjectsAction(search, actionSort)`.
- Client-side sort direction:

```ts
'score_desc' | 'score_asc' | 'date_desc' | 'date_asc'
```

- Search by name/website.
- Render table.
- Click row navigate sang `/project/${proj.id}`.
- Delete bằng `deleteProjectAction(id)` với `confirm`.

Điểm cần chú ý:

- `useEffect(() => { fetchProjects(); }, [search, sortBy]);` có thể trigger fetch mỗi keystroke. Nếu danh sách lớn, nên debounce.
- `onChange={(e) => setSortBy(e.target.value as any)}` đang dùng `as any`. Có thể clean type sau.
- Delete confirmation dùng browser `confirm`, đơn giản nhưng chưa custom modal.

### `src/app/project/[id]/page.tsx`

Server Component/RSC cho detail page.

Điểm Next 16 đáng chú ý:

```ts
interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;
}
```

Đây có vẻ là convention Next 16 nơi route params là Promise. Không đổi về kiểu Next cũ nếu chưa đọc docs.

Vai trò:

- Await params.
- Gọi `getProjectById(id)` trực tiếp trong RSC.
- Nếu không có project, render empty/error state.
- Nếu có, render back link + UUID pill + `ProjectResult`.

### `src/app/components/Navbar.tsx`

Client component.

Vai trò:

- Sticky navbar.
- Brand `Primus Research AI` với logo `/primus-logo.svg`.
- Nav items:

```text
Research Mới -> /
Danh Sách Theo Dõi -> /list
```

- Active state theo `usePathname`.
- Mobile menu open/close state.

### `src/app/layout.tsx`

Root layout.

Vai trò:

- Import Geist fonts.
- Metadata tiếng Việt.
- Render `Navbar`.
- Main container max width.
- Footer.

Metadata hiện tại:

```ts
title: 'Primus Research AI - Tự Động Chấm Điểm Dự Án Crypto'
description: 'Hệ thống tự động hóa quy trình nghiên cứu dự án Crypto bằng AI...'
```

Footer hiện nói:

```text
© currentYear Primus Research AI. Đánh giá tự động được cung cấp bởi OpenRouter & Gemini Online.
```

### `src/app/globals.css`

Global styling:

- Tailwind v4 import:

```css
@import "tailwindcss";
```

- CSS variables:

```css
--background: #060913;
--foreground: #f8fafc;
--card: #0d1326;
--card-border: rgba(255, 255, 255, 0.06);
--accent-green: #10b981;
--accent-yellow: #f59e0b;
--accent-red: #f43f5e;
```

- Body background uses radial gradients and dark cyberpunk style.
- Custom scrollbar.
- `@theme inline` maps CSS vars to Tailwind tokens.
- `.glass-card` class for translucent cards.
- `.glow-green`, `.glow-yellow`, `.glow-red`.

Design direction:

- Deep dark theme.
- Indigo/emerald/amber/rose score colors.
- Glassmorphism.
- VC/research dashboard aesthetic.

### `public/primus-logo.svg`

Custom logo for Primus Research. Used in Navbar via Next `Image`.

### `.env.example`

Documents env vars:

```text
OPENROUTER_API_KEY=your_openrouter_api_key_here
# OPENROUTER_MODEL=google/gemini-3-flash-preview:online
DATABASE_URL=postgres://username:password@hostname:5432/dbname?sslmode=require
```

Important:

- README says if `DATABASE_URL` is not filled app falls back local. If user copies `.env.example` as-is, `DATABASE_URL` will be a placeholder non-empty string and app may try to connect to invalid DB instead of local fallback. Better guidance is to comment out `DATABASE_URL` in `.env.local` when not using DB.
- OpenRouter API key is required for actual research.

### `package.json`

Scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

Dependencies:

```json
{
  "cheerio": "^1.2.0",
  "lucide-react": "^1.17.0",
  "next": "16.2.6",
  "pg": "^8.21.0",
  "react": "19.2.4",
  "react-dom": "19.2.4"
}
```

Dev dependencies include Tailwind v4, TypeScript, ESLint 9, Next ESLint config.

---

## 9. Prompt Và LLM Behavior

System prompt trong `openrouter.ts` yêu cầu LLM đóng vai:

```text
Senior Analyst trong team Research & Due Diligence của một quỹ VC crypto (Primus Research)
```

Tone:

- Khắt khe.
- Skeptical by default.
- Ưu tiên bằng chứng kiểm chứng được.
- Không bịa thông tin.
- Nếu thiếu dữ liệu, nói rõ chưa đủ dữ liệu.
- Viết tiếng Việt tự nhiên, thuật ngữ chuyên ngành chuẩn.

Nguồn dữ liệu yêu cầu:

1. Nội dung cào từ website.
2. Dữ liệu bổ sung user cung cấp.
3. Web search mới nhất về backers/funding/team/on-chain/community/audit/GitHub.

JSON output bắt buộc:

```json
{
  "projectName": "Tên dự án",
  "website": "URL website chính thức",
  "summary": "Tóm tắt 1 dòng",
  "scores": {
    "teamFounders": { "score": 18, "max": 22, "reasoning": "...", "confidence": "Cao" },
    "marketTiming": { "score": 13, "max": 16, "reasoning": "...", "confidence": "Trung bình" },
    "productProblem": { "score": 12, "max": 16, "reasoning": "...", "confidence": "Cao" },
    "techSecurity": { "score": 9, "max": 13, "reasoning": "...", "confidence": "Thấp" },
    "tractionMetrics": { "score": 8, "max": 13, "reasoning": "...", "confidence": "Trung bình" },
    "businessMoat": { "score": 7, "max": 10, "reasoning": "...", "confidence": "Cao" },
    "tokenomics": { "score": null, "max": 6, "reasoning": "N/A ...", "confidence": "Thấp" },
    "dealValuation": { "score": null, "max": 4, "reasoning": "N/A ...", "confidence": "Thấp" }
  },
  "totalScore": 81,
  "detailedAssessment": "...",
  "strengths": ["..."],
  "risks": ["..."],
  "redFlags": ["..."],
  "recommendation": "INVEST / PASS / NEED MORE INFO - kèm lý do",
  "questionsForFounder": ["..."]
}
```

`totalScore` từ LLM không được tin tuyệt đối. Code sẽ recalculate ở `processAndNormalizeResult`.

---

## 10. Lịch Sử Phát Triển Và Debug

### 10.1 Khởi tạo dự án

Ban đầu muốn build trong folder `AI-research`. `create-next-app` có thể từ chối do package name chứa chữ hoa. Workaround lịch sử:

1. Tạo trong folder con `crypto-research`.
2. Di chuyển file ra root.
3. Xóa folder con.

### 10.2 Fix TypeScript cho LLM response

Bug:

```text
Property 'projectName' does not exist on type 'LLMResult'
```

Giải pháp:

- Tạo interface `LLMResponse`.
- Map rõ ràng từ LLM response sang DB schema trong `actions.ts`.

### 10.3 Fix Cheerio typing

Bug:

```text
'this' context of type 'Cheerio<Element> | Cheerio<Document>'
```

Giải pháp lịch sử:

- Thay `$.root()` bằng selector thống nhất hơn (`$('html')` hoặc `body/html`) để tránh mismatch type.

Code hiện tại:

```ts
const bodyContent = $('body').length > 0 ? $('body') : $('html');
let cleanText = bodyContent.text()
```

### 10.4 Env var fallback cho OpenRouter

Bug production:

- Vercel env từng đặt tên `Openrouter` thay vì `OPENROUTER_API_KEY`.
- App bị lỗi 500 vì không đọc được key.

Giải pháp:

```ts
process.env.OPENROUTER_API_KEY || process.env.Openrouter || process.env.OPENROUTER
```

### 10.5 Model-aware payload

Bug:

- `tencent/hy3-preview` trả empty content khi gửi `response_format: json_object`.
- Một số model không hỗ trợ web plugin.

Giải pháp:

- Chỉ gửi JSON response format cho `google/`, `openai/`, `anthropic/`, `deepseek/`.
- Chỉ gửi web plugin cho model id có `:online`.

### 10.6 ActionResult pattern

Bug:

- Production Next.js sanitize thrown errors trong Server Actions, user chỉ thấy generic message.

Giải pháp:

- `analyzeProjectAction` return `ActionResult<Project>`.
- UI check `result.success`.
- Error message thật hiển thị trong card error.

### 10.7 Rebrand sang Primus Research AI

Thay đổi:

- Branding từ `CryptoResearch AI` sang `Primus Research AI`.
- Thêm logo SVG custom `public/primus-logo.svg`.
- Cập nhật Navbar, layout metadata, footer, style.

### 10.8 Nâng cấp score framework

Thay đổi:

- Từ 7 tiêu chí cũ sang 8 tiêu chí VC DD:
  - Team & Founders.
  - Market & Timing.
  - Product & Problem.
  - Tech & Security.
  - Traction & Metrics.
  - Business Model & Moat.
  - Tokenomics.
  - Deal & Valuation.

Tác động:

- `openrouter.ts`: prompt + types.
- `db.ts`: Project interface + schema + columns.
- `actions.ts`: mapping fields mới.
- `ProjectResult.tsx`: scorecard mới, confidence badges, red flags, questions.

### 10.9 Re-normalization động

Thay đổi:

- LLM có thể trả `score: null`.
- Code tự normalize tổng điểm dựa trên các category có dữ liệu.
- UI hiển thị N/A muted style, không crash khi thiếu keys.

---

## 11. Known Issues / Technical Debt

### 11.1 Retry path bỏ qua normalization

File:

```text
src/lib/openrouter.ts
```

Hiện tại:

```ts
try {
  const content = await makeApiCall();
  return processAndNormalizeResult(content);
} catch (firstError) {
  ...
  try {
    const content = await makeApiCall();
    return extractJson(content);
  } catch (secondError: any) {
    ...
  }
}
```

Nên đổi retry success thành:

```ts
return processAndNormalizeResult(content);
```

Độ ưu tiên: cao vừa. Không phải crash bug thường xuyên, nhưng có thể gây dữ liệu điểm không chuẩn khi retry path xảy ra.

### 11.2 Client imports server-heavy `openrouter.ts`

File:

```text
src/app/page.tsx
```

Import:

```ts
import { OPENROUTER_MODELS } from '@/lib/openrouter';
```

`openrouter.ts` chứa server logic, prompt dài, env access và fetch OpenRouter. Vì page là client component, việc import constant từ file này có thể làm client bundle chứa prompt hoặc gây bundling concern. Nếu build/lint cảnh báo, tách model list sang:

```text
src/lib/models.ts
```

Rồi import `OPENROUTER_MODELS` ở cả client và server.

### 11.3 `.env.example` có `DATABASE_URL` placeholder không comment

Nếu user copy `.env.example` thành `.env.local` và không sửa DB URL, app sẽ đọc placeholder non-empty và cố connect Postgres. Có thể gây delay/fallback hoặc lỗi.

Nên cân nhắc đổi thành:

```text
# DATABASE_URL=postgres://username:password@hostname:5432/dbname?sslmode=require
```

Và ghi rõ: để trống/comment nếu muốn dùng local fallback.

### 11.4 Watchlist search không debounce

File:

```text
src/app/list/page.tsx
```

Mỗi ký tự search trigger Server Action. Với local ít dữ liệu không sao, nhưng nếu production nhiều data thì nên debounce.

### 11.5 `as any` còn tồn tại

Các điểm có `any`:

- `extractJson(text): any`
- catch `(error: any)`
- `values: any[]`
- `setSortBy(e.target.value as any)`
- `(scores as any)[key]`

Không khẩn cấp, nhưng nếu muốn strict polish thì nên thay bằng type guards.

### 11.6 Local file DB không phù hợp production serverless

Fallback `.local_db/projects.json` hữu ích cho local/dev. Trên Vercel/serverless, local filesystem không phải persistence bền vững. Production nên luôn có Postgres/Neon/Vercel Postgres.

### 11.7 Scraper chỉ cào 1 trang

Hiện scraper không crawl docs, blog, subpages. LLM được kỳ vọng dùng web search để bổ sung. Nếu muốn chất lượng DD tốt hơn, có thể thêm optional crawl sitemap/internal links, nhưng cần cẩn thận timeout/cost.

### 11.8 LLM model IDs có thể thay đổi

Model list như GPT-5.5, Claude Opus 4.6, Gemini 3.5 Flash Online, v.v. phụ thuộc OpenRouter availability. Nếu model fail, kiểm tra OpenRouter model catalog hiện tại trước khi kết luận bug app.

---

## 12. Cách Chạy Local

### 12.1 Cài dependencies

```bash
cd /Users/peter/AI/AI-research
npm install
```

### 12.2 Tạo env local

```bash
cp .env.example .env.local
```

Sửa `.env.local`:

```text
OPENROUTER_API_KEY=your_real_openrouter_key
# DATABASE_URL=postgres://...
```

Nếu muốn dùng local JSON fallback, hãy comment hoặc xóa `DATABASE_URL`.

### 12.3 Chạy dev server

```bash
npm run dev
```

Mở:

```text
http://localhost:3000
```

### 12.4 Build

```bash
npm run build
```

### 12.5 Lint

```bash
npm run lint
```

Chưa có kết quả build/lint mới được ghi trong lần cập nhật tài liệu này. Nếu Claude sửa code, nên chạy ít nhất `npm run lint` và `npm run build` nếu thay đổi không quá nhỏ.

---

## 13. Cách Deploy / Redeploy Vercel

Theo lịch sử dự án:

```bash
cd /Users/peter/AI/AI-research
npx vercel --prod --yes
```

Production cần env vars:

```text
OPENROUTER_API_KEY
DATABASE_URL
```

Optional:

```text
OPENROUTER_MODEL
```

Vercel Postgres/Neon cần SSL, code hiện đã dùng:

```ts
ssl: { rejectUnauthorized: false }
```

Nếu deploy lỗi do DB:

1. Kiểm tra Vercel env `DATABASE_URL`.
2. Kiểm tra storage integration có link đúng project không.
3. Xem log của `ensureTable()`.
4. Nhớ production không nên dựa vào `.local_db`.

Nếu deploy lỗi do LLM:

1. Kiểm tra env `OPENROUTER_API_KEY`.
2. Kiểm tra model id còn tồn tại/được account hỗ trợ.
3. Với model không online, đừng kỳ vọng web plugin.
4. Với Tencent/Qwen, đừng ép `response_format`.

---

## 14. UX/UI Hiện Tại

Style tổng thể:

- Dark cyberpunk.
- Glass cards.
- Indigo primary.
- Emerald/amber/rose cho score status.
- Vietnamese UI copy.
- Dashboard-first, không phải landing page marketing.

Main screens:

1. `/`
   - Header giới thiệu ngắn.
   - Form research.
   - Model dropdown.
   - Raw context textarea.
   - Loading stepper.
   - Result report.

2. `/list`
   - Dashboard watchlist.
   - Search.
   - Sort by date/score asc/desc.
   - Table projects.
   - Delete action.

3. `/project/[id]`
   - Back to list.
   - UUID pill.
   - Full ProjectResult.

Responsive:

- Navbar có mobile menu.
- Scorecard table chuyển thành stacked mobile rows.
- Watchlist table dùng horizontal overflow.

---

## 15. Những Nguyên Tắc Khi Sửa Tiếp

### 15.1 Không phá schema

Các report đã lưu có thể dùng schema cũ. `ProjectResult` hiện có fallback để không crash. Nếu thay đổi `scores`, phải giữ backward compatibility hoặc migration.

### 15.2 Không tin điểm tổng từ LLM

Luôn recalculate `totalScore` bằng code server-side. LLM có thể sai toán, trả string, trả N/A, hoặc vượt max.

### 15.3 Không throw trực tiếp khỏi Server Action cho lỗi user-facing

Với `analyzeProjectAction`, giữ `ActionResult` để production hiển thị message tốt.

### 15.4 Không gửi unsupported OpenRouter fields cho mọi model

Giữ model-aware payload:

- JSON response format chỉ cho model hỗ trợ.
- Web plugin chỉ cho `:online`.

### 15.5 Scraper fail vẫn phải cho analysis tiếp tục

Không biến scrape fail thành hard fail nếu mục tiêu là research bằng LLM/web search. Trả note fallback như hiện tại là chủ ý thiết kế.

### 15.6 Nếu thêm feature DB, update cả local fallback

Repo có hai storage modes. Đừng chỉ sửa Postgres mà quên `.local_db`.

### 15.7 Nếu sửa Next-specific code, nhớ Next 16

`AGENTS.md` cảnh báo Next version có breaking changes. Đặc biệt dynamic route params đang là Promise trong `/project/[id]`.

---

## 16. Suggested Next Tasks

Nếu cần cải thiện nhanh, ưu tiên:

1. Fix retry normalization bug trong `src/lib/openrouter.ts`.
2. Tách `OPENROUTER_MODELS` khỏi `openrouter.ts` sang file shared nhỏ để tránh client import prompt/server code.
3. Comment `DATABASE_URL` trong `.env.example` để local fallback hoạt động đúng khi copy env.
4. Chạy `npm run lint` và `npm run build`.
5. Nếu build lỗi Next 16, đọc docs local trong `node_modules/next/dist/docs/`.
6. Debounce search trên `/list` nếu dữ liệu nhiều.
7. Thêm tests/unit cho `processAndNormalizeResult` nếu tách helper export được.

---

## 17. Quick Mental Model Cho Claude

Hãy hiểu dự án này như một pipeline:

```text
URL + user context
  -> scrape one website page
  -> LLM research prompt via OpenRouter
  -> strict JSON result
  -> server-side score normalization
  -> save Project to Postgres/local JSON
  -> render VC-style scorecard
  -> allow watchlist review/search/delete
```

Điều quan trọng nhất không phải UI, mà là giữ data contract ổn định giữa:

```text
openrouter.ts LLMResponse
db.ts Project
actions.ts mapping
ProjectResult.tsx rendering
Postgres schema/local JSON
```

Nếu một trong các lớp này lệch shape, app có thể build được nhưng report sẽ crash hoặc hiển thị sai.

---

## 18. Cập Nhật Gần Nhất Từ Codex

Ngày cập nhật: 2026-05-29.

Codex đã đọc các file chính trong `/Users/peter/AI/AI-research`, xác nhận đây là app Next.js/TypeScript dùng OpenRouter để research/chấm điểm dự án crypto, và bổ sung tài liệu này để Claude có thể hiểu dự án từ đầu đến hiện tại.

---

## 19. Tích Hợp Hệ Thống Điều Khiển Bot Viết Bài Telegram/X (Dang-bai-X-bot)

Ngày cập nhật: 2026-06-06.

Hệ thống đã tích hợp Admin Control Dashboard điều khiển bot viết bài Telegram/X trực tiếp trên Web App Next.js thông qua cơ chế **DB-as-command-queue** để đảm bảo kết nối một chiều an toàn (outbound-only) cho VPS.

### 19.1 Kiến trúc giao tiếp
Giao tiếp giữa Vercel Web App và VPS Python Bot diễn ra qua các bảng trung gian trên Neon PostgreSQL:
- **`bot_commands`**: Capture các thao tác điều khiển từ Web Admin (`GENERATE`, `PUBLISH`, `REGENERATE_THREAD`, `REGENERATE_IMAGES`, `REGENERATE_ALL`, `CANCEL`, `TRENDING`). VPS Bot sẽ thực hiện polling hàng đợi này mỗi 2 giây.
- **`bot_status`**: Lưu trữ trạng thái heartbeat trực tuyến của VPS Bot (last_seen, uptime, config hoạt động, status 'idle'/'working') cập nhật mỗi 10 giây.
- **`draft_articles`**: Lưu trữ các bài viết nháp (topic, status, version, payload chi tiết gồm title, article_md, tweets thread, images source url, và `meta` object). Sử dụng trường `version` để tối ưu hóa concurrency lock (Optimistic Locking) khi publish.
- **`recent_articles`**: Nhật ký lưu trữ lịch sử các bài viết đã phát hành thành công lên WordPress Web và các tài khoản X (Twitter).

### 19.2 Mã nguồn Next.js được bổ sung
- **[db.ts](file:///Users/peter/AI/AI-research/src/lib/db.ts)**: Bổ sung các data models và database helper functions (`createBotCommand`, `getBotCommands`, `getBotStatus`, `getDraftArticles`, `getDraftArticleById`, `updateDraftArticle`, `saveDraftArticle`, `getRecentArticles`) hỗ trợ đồng thời chế độ PostgreSQL Production và Local File fallback (`.local_db/bot_commands.json`...).
- **[admin/page.tsx](file:///Users/peter/AI/AI-research/src/app/admin/page.tsx)**: Giao diện quản trị Admin Dashboard mang phong cách Cyberpunk, tự động polling trạng thái bot, cho phép gửi lệnh viết bài mới, biên tập bài viết nháp (Markdown), sắp xếp / chỉnh sửa thẻ Tweet Card, kích hoạt phê duyệt và đăng bài lên WordPress & X.
  - **Khung Cấu Hình Xuất Bản (Publishing Configs Panel)**: Cho phép lựa chọn **Tài khoản & Web đăng** (Primus Spark / AZDAG), **Phương thức đăng** (Cả Web & X, Chỉ Web, Chỉ X) và **Định dạng trên X** (Twitter Thread / X Article) lưu trực tiếp vào trường `meta` của bản ghi nháp.
  - **Nới rộng giới hạn ký tự X**: Thay đổi validation limit từ 280 ký tự lên **4000 ký tự** để đáp ứng hoàn toàn cho tài khoản X có tick xanh viết tweet dài.
  - **Khung Gợi Ý Chủ Đề Hot (Trending Panel)**: Tách danh sách 9 chủ đề gợi ý nổi bật ra thành một panel lớn dạng lưới (Grid), hiển thị chi tiết tên chủ đề, lý do xu hướng (reason), và nguồn tin (source) từ RSS. Bấm chọn nhanh chủ đề sẽ tự động focus và cuộn đến ô nhập lệnh GENERATE.
- **[actions/admin.ts](file:///Users/peter/AI/AI-research/src/app/actions/admin.ts)**: Các Server Actions thực thi nghiệp vụ quản trị bot trên môi trường Vercel Serverless (chỉ chạy ở phía server để bảo mật các khóa API và kết nối database).
- **[Navbar.tsx](file:///Users/peter/AI/AI-research/src/app/components/Navbar.tsx)**: Tích hợp nút **Theme Switcher** (Mặt trời/Mặt trăng) trên thanh điều hướng đầu trang cho cả phiên bản Desktop và Mobile, tự động thay đổi theme sáng/tối toàn ứng dụng và lưu cache lựa chọn vào `localStorage`.
- **[globals.css](file:///Users/peter/AI/AI-research/src/app/globals.css)**: Định nghĩa lớp `.light` chứa các biến CSS màu sáng và bộ CSS overrides cho tất cả các thẻ input, card, panel để ứng dụng hiển thị hoàn hảo ở chế độ Light Mode. Đã sửa lỗi escape ký tự đặc biệt selector (`[`, `#`, `/`) để biên dịch dự án Next.js sạch sẽ 100%.

### 19.3 Mã nguồn VPS Bot được bổ sung
- **`/opt/Dang-bai-X-bot/src/worker.py`**:
  - Điểm khởi tạo vòng lặp Worker (`worker_loop` - polling commands) và Heartbeat (`heartbeat_loop` - báo cáo tình trạng bot) chạy song song qua asyncio. Tự động dispatch các lệnh điều khiển, gọi pipeline research và publish tương ứng.
  - **Cơ chế Tự Phục Hồi (Self-Healing Cleanup)**: Thêm khối lệnh dọn dẹp lúc worker khởi động. Tự động quét tìm và chuyển các lệnh kẹt ở trạng thái `processing` (do bot bị tắt hoặc restart đột ngột giữa chừng) thành trạng thái `failed` với lỗi cụ thể để tránh nghẽn hàng đợi (Queue lock).
  - **Bảo toàn cấu hình**: Chỉnh sửa `heartbeat_loop` sử dụng `.update()` để ghi đè cập nhật uptime và model config mà không xóa đi các key khác trong cơ sở dữ liệu (đặc biệt là key `trending_topics` do scheduler tạo ra).
- **`/opt/Dang-bai-X-bot/main.py`**: Thay thế cơ chế Telegram Polling nguyên bản bằng việc chạy Worker & Heartbeat kết hợp với Cron Scheduler (Trending Job). Toàn bộ giao tiếp với Telegram được chuyển đổi thành thông báo outbound-only.
- **`/opt/Dang-bai-X-bot/src/db.py`**: Nâng cấp SQLAlchemy engine tương thích PostgreSQL & SQLite. Đặc biệt, để sửa lỗi prepared statement cache với PgBouncer của Neon trên driver `psycopg3`, cấu hình engine được đổi sang sử dụng tham số `connect_args={"prepare_threshold": None}`.
- **`/opt/Dang-bai-X-bot/config.yaml`**: Lưu trữ cấu hình bot. Mục `trending.num_topics` đã được chỉnh sửa từ `10` thành `9` theo yêu cầu điều chỉnh giao diện.

### 19.4 Hướng dẫn vận hành VPS Bot (PM2)
- Xem danh sách tiến trình: `pm2 list` (ID tiến trình bot mặc định là `11` và tên `Dang-bai-X-bot`).
- Khởi động lại Bot sau khi cấu hình hoặc đổi biến môi trường: `pm2 restart Dang-bai-X-bot --update-env`.
- Đọc logs thời gian thực: `pm2 logs Dang-bai-X-bot`.
- Cần đảm bảo file `/opt/Dang-bai-X-bot/.env` được cấu hình khóa `DATABASE_URL` (pooled connection string từ Neon) để kích hoạt tích hợp dữ liệu với Web App.
- Theo dõi log ứng dụng thực tế tại: `/opt/Dang-bai-X-bot/logs/bot.log`.
- Cơ chế reset lệnh kẹt hoạt động tự động khi bạn thực hiện restart bot thông qua PM2.




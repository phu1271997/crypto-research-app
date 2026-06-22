# Primus Research AI - HỒ SƠ KIẾN TRÚC & LOGIC KỸ THUẬT TOÀN DIỆN 🚀

Tài liệu này đóng gói toàn bộ logic hoạt động, kiến trúc hệ thống, quy trình nghiệp vụ và đặc tả mã nguồn chi tiết của web-app **Primus Research AI** (trước đây là Crypto Research & Scoring). Tài liệu được cấu trúc cực kỳ chi tiết nhằm cung cấp đầy đủ ngữ cảnh cho bất kỳ hệ thống AI hoặc lập trình viên mới nào muốn tái xây dựng, vận hành hoặc mở rộng dự án.

---

## 1. TỔNG QUAN HỆ THỐNG & MỤC TIÊU DỰ ÁN

**Primus Research AI** là một hệ thống **Due Diligence tự động** dành cho các dự án Crypto giai đoạn sớm (pre-token / pre-IPO). Hệ thống hoạt động dựa trên các nguyên tắc phân tích cơ bản (Fundamental Analysis) của quỹ đầu tư mạo hiểm (VC) chuyên nghiệp:
- **Đầu vào**: Người dùng cung cấp URL website của dự án, các tài liệu đính kèm (tùy chọn) và chọn mô hình LLM để phân tích.
- **Quy trình**: Hệ thống tự động cào thông tin trang web, kích hoạt tính năng **Web Search** thời gian thực (để xác thực danh tính đội ngũ, backers, dữ liệu on-chain DeFiLlama/Dune, mã nguồn GitHub, cộng đồng), chấm điểm dự án theo thang **100 điểm có trọng số (8 hạng mục)**, phát hiện **Red Flags** tiềm ẩn và xuất báo cáo khuyến nghị đầu tư kiểu memo nội bộ trình lên Investment Committee (IC).
- **Trọng tâm đặc biệt**: Giảm thiểu trọng số của thông tin Founders (do dự án giai đoạn sớm thường chưa công khai danh tính) và dồn trọng tâm phân tích vào sản phẩm thực tế, công nghệ cốt lõi, traction và lợi thế cạnh tranh (Moat). Khi thiếu thông tin (ví dụ: chưa công bố Tokenomics hoặc Deal terms), hệ thống tự động loại bỏ hạng mục đó và **tái chuẩn hóa (re-normalize) điểm tổng về thang 100**.

---

## 2. BẢN ĐỒ KIẾN TRÚC & LUỒNG DỮ LIỆU (SEQUENCE DIAGRAM)

Dưới đây là luồng hoạt động đồng bộ từ khi người dùng kích hoạt phân tích cho đến khi hiển thị kết quả và lưu trữ:

```mermaid
sequenceDiagram
    autonumber
    actor User as Nhà đầu tư (User)
    participant FE as Frontend Client (Next.js)
    participant SA as Server Actions (actions.ts)
    participant SC as Scraper (scraper.ts)
    participant OR as OpenRouter (openrouter.ts)
    participant DB as Database (db.ts / Postgres)

    User->>FE: Nhập URL dự án + Info bổ sung + Chọn Model LLM
    FE->>SA: Gọi Server Action analyzeProjectAction(url, info, model)
    FE->>FE: Kích hoạt Loading Stepper động (hiển thị tiến độ theo Model)
    SA->>SC: Gọi scrapeWebsite(url)
    SC->>SC: Gửi HTTP Request, strip HTML tags nhiễu & giới hạn 8k ký tự thô
    SC-->>SA: Trả về văn bản website sạch (Text thô)
    SA->>OR: Gọi researchAndScoreProject(url, scrapedText, info, model)
    OR->>OR: LLM gọi Web Search kiểm chứng on-chain, GitHub, backers, Twitter
    OR->>OR: Chấm điểm 8 hạng mục (null nếu thiếu thông tin), phát hiện Red Flags & viết Memo IC
    OR-->>SA: Trả về văn bản dạng JSON khớp 100% Schema yêu cầu
    SA->>SA: Gọi processAndNormalizeResult để lọc sạch, ép kiểu & tự động re-normalize tổng điểm về thang 100
    SA->>DB: Gọi saveProject(projectData)
    DB->>DB: Auto-migration (tự động tạo bảng & bổ sung cột mới nếu nâng cấp schema)
    DB-->>SA: Trả về Project đã lưu kèm UUID và timestamp
    SA->>FE: Trả về kết quả ActionResult (Pattern: success/error)
    FE->>User: Renders UI Scorecard DD, Red Flags, đầu tư INVEST/PASS & Q&A với Founder
```

---

## 3. CƠ CẤU BỘ TIÊU CHÍ CHẤM ĐIỂM VC DD VÀ CÔNG THỨC QUY ĐỔI

Hệ thống đánh giá dự án dựa trên **8 hạng mục có trọng số** nghiêm ngặt. Mỗi hạng mục bao gồm: điểm số (`score`), điểm tối đa (`max`), lý do chấm điểm bằng tiếng Việt (`reasoning`), và mức độ tin cậy dữ liệu (`confidence` - Cao/Trung bình/Thấp).

### Bảng Trọng Số Tiêu Chuẩn (Tổng = 100)

| STT | Khóa JSON | Hạng mục | Max Điểm | Trọng số | Chỉ dẫn đánh giá quan trọng |
|:---:|---|---|:---:|:---:|---|
| 1 | `teamFounders` | Team & Founders | **10** | 10% | Coi trọng sự thực thi. Nếu ẩn danh hoặc chưa công khai ở giai đoạn sớm, chấm điểm là `null` (N/A) chứ không trừ điểm nặng hoặc suy diễn xấu. |
| 2 | `marketTiming` | Thị trường & Timing | **16** | 16% | Đánh giá TAM/SAM/SOM, narrative xu hướng, painkiller vs vitamin. |
| 3 | `productProblem` | Sản phẩm & Vấn đề | **21** | 21% | **Trọng tâm cốt lõi**. Đánh giá kỹ mô hình sản phẩm, hoạt động và sự cần thiết của blockchain. |
| 4 | `techSecurity` | Công nghệ & Bảo mật | **17** | 17% | **Trọng tâm cốt lõi**. Phân tích đổi mới công nghệ cốt lõi vs fork/copy code, audit, hoạt động GitHub thực tế. |
| 5 | `tractionMetrics` | Traction & Metrics | **14** | 14% | Phân biệt tăng trưởng thật (DAU/MAU/TVL/Vol) với wash trading hoặc incentive farming. |
| 6 | `businessMoat` | Mô hình KD & Moat | **12** | 12% | Network effect, switching cost, cơ chế value capture bền vững cho token. |
| 7 | `tokenomics` | Tokenomics | **6** | 6% | *Có điều kiện*. Tiện ích token, phân bổ insider, lịch vesting/unlock. |
| 8 | `dealValuation` | Deal & Định giá | **4** | 4% | *Có điều kiện*. Định giá FDV so với traction, instrument (SAFE/SAFT/Warrant). |

### Công Thức Tái Chuẩn Hóa Điểm Số (Dynamic Re-normalization)

Ở các dự án giai đoạn sớm, thông tin về `tokenomics` và `dealValuation` thường chưa tồn tại. Thay vì gán điểm bằng `0` (làm giảm điểm oan uổng), hệ thống gán giá trị `null` (N/A) cho các hạng mục thiếu dữ liệu. 

Điểm tổng (`totalScore`) được tính toán động bằng code phía Server để loại bỏ sai số tính toán của LLM theo công thức:

$$\text{Điểm tổng} = \text{Round} \left( \frac{\sum \text{Điểm của các hạng mục có dữ liệu}}{\sum \text{Điểm tối đa của các hạng mục có dữ liệu}} \times 100 \right)$$

#### Ví dụ minh họa:
- **Dự án A (Đầy đủ thông tin)**: Chấm đạt 80 điểm trên tổng tối đa 100 điểm $\rightarrow$ Điểm tổng = **80/100**.
- **Dự án B (Chưa công bố Tokenomics và Deal Terms - Hai mục này nhận giá trị `null`)**:
  - Hạng mục hoạt động: 1 đến 6 (Team, Market, Product, Tech, Traction, Moat).
  - Tổng số điểm tối đa của các mục hoạt động: $10 + 16 + 21 + 17 + 14 + 12 = 90$.
  - Giả sử tổng điểm đạt được ở 6 mục này là $72$ điểm.
  - Điểm tổng chuẩn hóa = $\text{Round} \left( \frac{72}{90} \times 100 \right) = \mathbf{80/100}$.

---

## 4. CHI TIẾT CẤU TRÚC THƯ MỤC CỐT LÕI

```text
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── Navbar.tsx         # Thanh điều hướng, logo SVG gradient, slogan Primus Research
│   │   │   └── ProjectResult.tsx  # Scorecard 8 tiêu chí, logic hiển thị N/A, Red flags, Q&A Founder
│   │   ├── list/
│   │   │   └── page.tsx           # Dashboard tra cứu dự án đã lưu, bộ lọc tìm kiếm, sort, xóa dữ liệu
│   │   ├── project/[id]/
│   │   │   └── page.tsx           # Trang động chi tiết của dự án truy vấn từ DB thông qua RSC
│   │   ├── actions.ts             # Server Actions xử lý luồng phân tích (ActionResult Pattern)
│   │   ├── globals.css            # Cấu hình Tailwind v4, cyberpunk glow theme, scrollbar custom
│   │   └── layout.tsx             # Root layout cấu hình SEO Metadata tiếng Việt
│   └── lib/
│       ├── db.ts                  # PostgreSQL Connection Pool + Local JSON Fallback + Auto migration
│       ├── scraper.ts             # Module cào website thô, lọc thẻ nhiễu & chống treo server
│       └── openrouter.ts          # Cấu hình 10 mô hình OpenRouter, system prompt DD, normalize score
├── public/
│   └── primus-logo.svg            # Tệp Logo SVG chính thức của quỹ đầu tư
```

---

## 5. ĐẶC TẢ CHI TIẾT LOGIC HOẠT ĐỘNG CỦA CÁC FILE NGUỒN

Dưới đây là mã nguồn và giải thích logic chi tiết từng thành phần cốt lõi của web-app:

### 5.1. Database Core Module (`src/lib/db.ts`)
**Nhiệm vụ**: Kết nối cơ sở dữ liệu Postgres (Neon/Vercel) phục vụ sản xuất và tự động chuyển sang cơ sở dữ liệu tệp cục bộ (`projects.json`) khi chạy local thiếu cấu hình môi trường. Thực hiện auto-migration thêm cột an toàn.

```typescript
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Định nghĩa kiểu dữ liệu đồng bộ
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

const databaseUrl = process.env.DATABASE_URL;
let pool: Pool | null = null;
let useLocalDb = false;
const localDbPath = path.join(process.cwd(), '.local_db', 'projects.json');

// Khởi tạo thư mục DB local
function ensureLocalDb() {
  const dir = path.dirname(localDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(localDbPath)) fs.writeFileSync(localDbPath, JSON.stringify([], null, 2));
}

if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }, // Neon/Vercel Postgres bắt buộc sử dụng SSL
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  } catch (error) {
    console.error('Postgres pool error, fallback to Local JSON:', error);
    useLocalDb = true;
    ensureLocalDb();
  }
} else {
  useLocalDb = true;
  ensureLocalDb();
}

// Auto-migration tự động cập nhật bảng khi thay đổi schema
let tableChecked = false;
async function ensureTable() {
  if (useLocalDb || !pool || tableChecked) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(`
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
      `);
      // Thêm cột an toàn cho dự án nâng cấp schema v2
      await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS red_flags JSONB DEFAULT '[]'::jsonb;");
      await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS questions_for_founder JSONB DEFAULT '[]'::jsonb;");
      tableChecked = true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Migration failed, fallback to local DB:', error);
    useLocalDb = true;
    ensureLocalDb();
  }
}

// CRUD Local DB JSON Helper
function getLocalProjects(): Project[] {
  ensureLocalDb();
  try {
    return JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveLocalProjects(projects: Project[]) {
  ensureLocalDb();
  fs.writeFileSync(localDbPath, JSON.stringify(projects, null, 2));
}

// Save Project API công khai
export async function saveProject(project: Omit<Project, 'id' | 'created_at'>): Promise<Project> {
  const newProject: Project = {
    ...project,
    id: crypto.randomUUID(),
    created_at: new Date()
  };

  await ensureTable();

  if (useLocalDb) {
    const projects = getLocalProjects();
    projects.push(newProject);
    saveLocalProjects(projects);
    return newProject;
  }

  if (!pool) throw new Error('Database pool not initialized');

  const query = `
    INSERT INTO projects (
      id, name, website, total_score, recommendation, 
      scores, summary, detailed_assessment, strengths, risks, 
      red_flags, questions_for_founder, raw_input
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, created_at;
  `;

  const values = [
    newProject.id,
    newProject.name,
    newProject.website,
    newProject.total_score,
    newProject.recommendation,
    JSON.stringify(newProject.scores),
    newProject.summary,
    newProject.detailed_assessment,
    JSON.stringify(newProject.strengths),
    JSON.stringify(newProject.risks),
    JSON.stringify(newProject.red_flags),
    JSON.stringify(newProject.questions_for_founder),
    newProject.raw_input || null
  ];

  const result = await pool.query(query, values);
  newProject.created_at = result.rows[0].created_at;
  return newProject;
}

// Lấy toàn bộ Project (Hỗ trợ tìm kiếm & lọc sắp xếp)
export async function getAllProjects(search = '', sortBy: 'score' | 'date' = 'date'): Promise<Project[]> {
  await ensureTable();

  if (useLocalDb) {
    let projects = getLocalProjects();
    if (search.trim()) {
      const q = search.toLowerCase();
      projects = projects.filter(p => p.name.toLowerCase().includes(q) || p.website.toLowerCase().includes(q));
    }
    projects.sort((a, b) => {
      if (sortBy === 'score') return b.total_score - a.total_score;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    return projects;
  }

  if (!pool) throw new Error('Database pool not initialized');

  let query = `
    SELECT id, name, website, total_score, recommendation, 
           scores, summary, detailed_assessment, strengths, risks, 
           red_flags, questions_for_founder, raw_input, created_at
    FROM projects
  `;
  const values: any[] = [];

  if (search.trim()) {
    query += ` WHERE name ILIKE $1 OR website ILIKE $1`;
    values.push(`%${search.trim()}%`);
  }

  query += sortBy === 'score' ? ` ORDER BY total_score DESC, created_at DESC` : ` ORDER BY created_at DESC`;

  const result = await pool.query(query, values);
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    website: row.website,
    total_score: row.total_score,
    recommendation: row.recommendation,
    scores: typeof row.scores === 'string' ? JSON.parse(row.scores) : row.scores,
    summary: row.summary,
    detailed_assessment: row.detailed_assessment,
    strengths: typeof row.strengths === 'string' ? JSON.parse(row.strengths) : row.strengths,
    risks: typeof row.risks === 'string' ? JSON.parse(row.risks) : row.risks,
    red_flags: typeof row.red_flags === 'string' ? JSON.parse(row.red_flags) : (row.red_flags || []),
    questions_for_founder: typeof row.questions_for_founder === 'string' ? JSON.parse(row.questions_for_founder) : (row.questions_for_founder || []),
    raw_input: row.raw_input,
    created_at: row.created_at
  }));
}

export async function getProjectById(id: string): Promise<Project | null> {
  await ensureTable();
  if (useLocalDb) {
    return getLocalProjects().find(p => p.id === id) || null;
  }
  if (!pool) throw new Error('Database pool not initialized');
  const query = `SELECT * FROM projects WHERE id = $1`;
  const result = await pool.query(query, [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    scores: typeof row.scores === 'string' ? JSON.parse(row.scores) : row.scores,
    strengths: typeof row.strengths === 'string' ? JSON.parse(row.strengths) : row.strengths,
    risks: typeof row.risks === 'string' ? JSON.parse(row.risks) : row.risks,
    red_flags: typeof row.red_flags === 'string' ? JSON.parse(row.red_flags) : (row.red_flags || []),
    questions_for_founder: typeof row.questions_for_founder === 'string' ? JSON.parse(row.questions_for_founder) : (row.questions_for_founder || []),
  };
}

export async function deleteProject(id: string): Promise<boolean> {
  await ensureTable();
  if (useLocalDb) {
    const list = getLocalProjects();
    const filtered = list.filter(p => p.id !== id);
    saveLocalProjects(filtered);
    return filtered.length < list.length;
  }
  if (!pool) throw new Error('Database pool not initialized');
  const res = await pool.query(`DELETE FROM projects WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
```

---

### 5.2. Web Scraper Module (`src/lib/scraper.ts`)
**Nhiệm vụ**: Cào văn bản hiển thị từ URL dự án, lọc bỏ hoàn toàn các thẻ mã nguồn, điều hướng, headers, footers để lấy thông tin mô tả sản phẩm thô chất lượng nhất. Tích hợp kiểm soát Timeout và User-Agent để chống treo server và chống bị chặn.

```typescript
import * as cheerio from 'cheerio';

export async function scrapeWebsite(url: string): Promise<string> {
  // Tránh treo Server Action bằng AbortController giới hạn tối đa 8 giây
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        // Giả lập Safari trên macOS để giảm thiểu bị Cloudflare chặn đầu
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Scraper nhận mã HTTP lỗi từ website: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Xóa hoàn toàn các tag không hiển thị nội dung hoặc text nhiễu
    $('script, style, noscript, svg, iframe, header, footer, nav, link, meta, select, button, form').remove();

    // Trích xuất văn bản thô hiển thị trên màn hình
    let rawText = $('html').text();

    // Tối ưu hóa khoảng trắng thừa để tiết kiệm token gửi LLM
    const cleanText = rawText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();

    // Giới hạn tối đa 8,000 ký tự thô để đảm bảo an toàn Context Window
    return cleanText.substring(0, 8000);

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.warn(`Scraping URL thất bại: ${url}. Lỗi: ${error.message}`);
    // Không ném lỗi ra ngoài làm sập luồng, trả văn bản thông báo lỗi
    // Nhờ đó, LLM vẫn có thể sử dụng Web Search để tiếp tục phân tích dự án
    return `[Lưu ý hệ thống: Không thể cào dữ liệu trực tiếp từ website dự án do lỗi bảo mật hoặc bị chặn truy cập. Vui lòng dựa hoàn toàn vào tính năng WEB SEARCH thời gian thực để phân tích thông tin về dự án này.]`;
  }
}
```

---

### 5.3. OpenRouter API & Score Normalization (`src/lib/openrouter.ts`)
**Nhiệm vụ**: Kết nối API OpenRouter với 10 mô hình tuyển chọn. Tích hợp tính năng Web Search, System Prompt chuyên dụng. Đặc biệt là quy trình **ép kiểu dữ liệu** và **re-normalize điểm số tự động** bằng code để đảm bảo tính an toàn dữ liệu đầu ra.

```typescript
export interface LLMResponse {
  projectName: string;
  website: string;
  summary: string;
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
  totalScore: number;
  detailedAssessment: string;
  strengths: string[];
  risks: string[];
  redFlags: string[];
  recommendation: string;
  questionsForFounder: string[];
}

export interface ModelInfo {
  id: string;
  name: string;
  inputPrice: string;
  outputPrice: string;
}

export const OPENROUTER_MODELS: ModelInfo[] = [
  { id: 'google/gemini-3-flash-preview:online', name: 'Gemini 3.5 Flash Online (Mặc định)', inputPrice: '0.075', outputPrice: '0.30' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', inputPrice: '0.435', outputPrice: '0.87' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', inputPrice: '0.10', outputPrice: '0.20' },
  { id: 'tencent/hy3-preview', name: 'Tencent Hunyuan 3 Preview', inputPrice: '0.50', outputPrice: '1.00' },
  { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5', inputPrice: '5.00', outputPrice: '15.00' },
  { id: 'openai/gpt-5.4', name: 'OpenAI GPT-5.4', inputPrice: '2.50', outputPrice: '7.50' },
  { id: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini', inputPrice: '0.15', outputPrice: '0.60' },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', inputPrice: '15.00', outputPrice: '75.00' },
  { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus', inputPrice: '1.00', outputPrice: '3.00' },
  { id: 'qwen/qwen3.7-max', name: 'Qwen 3.7 Max', inputPrice: '2.50', outputPrice: '7.50' }
];

function extractJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  } else {
    const startIndex = cleaned.indexOf('{');
    const endIndex = cleaned.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      cleaned = cleaned.substring(startIndex, endIndex + 1);
    }
  }
  return JSON.parse(cleaned);
}

export async function researchAndScoreProject(
  url: string, 
  scrapedText: string, 
  rawInputText = '',
  selectedModel?: string
): Promise<LLMResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.Openrouter || process.env.OPENROUTER;
  const model = selectedModel || process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview:online';

  if (!apiKey) throw new Error('OPENROUTER_API_KEY không được cấu hình trong biến môi trường.');

  const systemPrompt = `Bạn là một **Senior Analyst trong team Research & Due Diligence của một quỹ VC crypto (Primus Research)**. Nhiệm vụ của bạn là đánh giá một dự án crypto giai đoạn sớm (chưa có token, hoặc pre-IPO, đa số đang phát triển sản phẩm) và đưa ra khuyến nghị đầu tư có cơ sở để trình lên Investment Committee (IC).

Hãy đánh giá **khắt khe, hoài nghi có chủ đích (skeptical by default)**, ưu tiên sự thật trên on-chain data và bằng chứng kiểm chứng được hơn là marketing của dự án. Nếu thông tin thiếu, hãy nêu rõ "chưa đủ dữ liệu" thay vì suy đoán. Nếu phát hiện dấu hiệu mâu thuẫn hoặc thổi phồng, hãy chỉ rõ.

### NGUỒN DỮ LIỆU:
1. Nội dung cào từ website dự án.
2. Dữ liệu bổ sung do người dùng cung cấp (pitch deck, docs, v.v.).
3. Sử dụng tính năng WEB SEARCH để tìm kiếm thông tin mới nhất: Backers/Investors, funding rounds, team background (LinkedIn/Twitter), on-chain metrics (TVL, volume, users), community size, audit reports, GitHub activity, v.v.

### KHUNG CHẤM ĐIỂM — THANG 100 ĐIỂM CÓ TRỌNG SỐ
Chấm điểm trực tiếp từng hạng mục trên thang điểm tối đa tương ứng với trọng số của nó (tổng tối đa 100 điểm), kèm reasoning bằng tiếng Việt và mức độ tin cậy dữ liệu (Cao/Trung bình/Thấp). **Chú trọng phân tích sâu sắc về mô hình sản phẩm, công nghệ cốt lõi, traction thực tế và lợi thế cạnh tranh dài hạn (moat).**

1. **Team & Founders** (teamFounders): 0 đến 10 điểm — trọng số 10%
   - Trọng số nhỏ (10%) vì ở giai đoạn sớm, nhiều dự án chưa công khai danh tính team. **Khi dự án chưa công bố team hoặc ẩn danh, hãy trả về "score": null trong JSON đại diện cho N/A (chưa đủ dữ liệu để đánh giá hạng mục này), tuyệt đối KHÔNG tự suy diễn tiêu cực và không trừ điểm nặng vì lý do này.**
   - Track record: từng build/exit gì? Kinh nghiệm crypto và đúng lĩnh vực này?
   - Năng lực kỹ thuật core team (không chỉ founder marketing)?
   - Doxxed hay ẩn danh?
   - Full-time hay part-time? Mức độ cam kết (skin in the game)?
   - Chất lượng advisor — thật sự active hay chỉ "mượn tên"?
   - Khả năng tuyển dụng & giữ chân nhân tài.

2. **Thị trường & Timing** (marketTiming): 0 đến 16 điểm — trọng số 16%
   - Quy mô thị trường (TAM/SAM/SOM) và tốc độ tăng trưởng.
   - Dự án có nằm trong narrative đang/sắp lên không? Timing có hợp lý?
   - Đây là "vitamin" (nice-to-have) hay "painkiller" (giải quyết nỗi đau thật)?
   - Mức độ phụ thuộc vào bull market hay bền vững qua bear.

3. **Sản phẩm & Vấn đề giải quyết** (productProblem): 0 đến 21 điểm — trọng số 21% (TRỌNG TÂM CỐT LÕI)
   - Phân tích sâu sắc về mô hình sản phẩm và mô hình hoạt động thực tế. Vấn đề giải quyết có thật và đủ lớn không? Ai là người dùng thật?
   - Sản phẩm có **thực sự cần blockchain** không, hay chỉ "gắn mác Web3"?
   - Trạng thái: idea / demo / testnet / mainnet / đã có user trả phí?
   - Trải nghiệm sản phẩm so với giải pháp Web2 hoặc đối thủ Web3.

4. **Công nghệ & Bảo mật** (techSecurity): 0 đến 17 điểm — trọng số 17% (TRỌNG TÂM CỐT LÕI)
   - Phân tích chi tiết công nghệ cốt lõi và mức độ đổi mới kỹ thuật so với việc fork/copy. Kiến trúc kỹ thuật có hợp lý, độc đáo?
   - Chất lượng code (GitHub activity, contributors thật).
   - Đã audit chưa, audit bởi ai, kết quả? Lịch sử hack/exploit?
   - Mức độ phụ thuộc bên thứ ba / điểm lỗi tập trung.

5. **Traction & Metrics** (tractionMetrics): 0 đến 14 điểm — trọng số 14%
   - Số liệu tăng trưởng: users, TVL, doanh thu, volume, on-chain activity.
   - **Phân biệt growth thật vs bơm thổi**: retention, DAU/MAU, wash trading.
   - Tăng trưởng organic hay phụ thuộc hoàn toàn vào incentive?
   - Community engagement: thật hay bot/mercenary? (chất lượng > số lượng follower).

6. **Mô hình kinh doanh & Moat** (businessMoat): 0 đến 12 điểm — trọng số 12%
   - Phân tích moat/lợi thế cạnh tranh dài hạn: network effect, switching cost, tech, distribution? Dòng tiền/value capture đến từ đâu? Có bền vững không?
   - Đối thủ trực tiếp/gián tiếp và vị thế tương đối.
   - Mức độ dễ bị fork & vượt mặt.

7. **Tokenomics** (tokenomics): 0 đến 6 điểm — trọng số 6% (CÓ ĐIỀU KIỆN)
   - Nếu chưa công bố tokenomics, trả về "score": null trong JSON. Việc này bình thường ở giai đoạn sớm, KHÔNG trừ điểm.
   - Nếu đã công bố, chấm từ 0 đến 6 điểm dựa trên: Utility, supply/phân bổ, vesting, lạm phát, FDV.

8. **Điều khoản Deal & Định giá** (dealValuation): 0 đến 4 điểm — trọng số 4% (CÓ ĐIỀU KIỆN)
   - Nếu chưa có điều khoản/định giá, trả về "score": null trong JSON. KHÔNG trừ điểm.
   - Nếu đã có, chấm từ 0 đến 4 điểm dựa trên: Định giá so với traction, vesting, quyền lợi nhà đầu tư, cap table.

### KIỂM TRA RED FLAGS (gắn cờ ngay nếu xuất hiện):
- Team ẩn danh đi kèm việc thiếu hoàn toàn mọi bằng chứng năng lực (sản phẩm, code, GitHub...), hoặc có dấu hiệu liên quan scam/rug trước đây. (Chú ý: Ẩn danh đơn thuần ở giai đoạn sớm KHÔNG phải red flag).
- Partnership/backers "ma" (tự xưng nhưng không xác nhận được).
- Whitepaper/code đạo nhái, GitHub gần như chết.
- Metrics chỉ là vanity (follower mua, TVL nhờ incentive, wash trading).
- Tokenomics phân bổ lệch cho insider, unlock sớm và lớn.
- Hứa hẹn lợi nhuận phi thực tế, ngôn ngữ thiên về hype hơn substance.
- Né tránh câu hỏi về pháp lý, doanh thu, hoặc số liệu cụ thể.
- Rủi ro pháp lý/regulatory cao chưa được xử lý.

### NGUYÊN TẮC CHẤM ĐIỂM:
- Nếu một hạng mục thiếu thông tin (đặc biệt là Tokenomics hoặc Điều khoản Deal, hoặc Team chưa công bố danh tính), đặt "score": null.
- Việc tính điểm tổng re-normalize quy về thang 100 sẽ được hệ thống tự động tính dựa trên các mục có điểm.
- KHÔNG BỊA RA THÔNG TIN. Giọng văn ngắn gọn, thẳng thắn, đúng kiểu memo nội bộ cho IC. Không tô vẽ.
- Toàn bộ nội dung PHẢI bằng TIẾNG VIỆT tự nhiên, thuật ngữ chuyên ngành chuẩn xác.

### BẮT BUỘC TRẢ VỀ JSON FORMAT CHUẨN:
{
  "projectName": "Tên dự án",
  "website": "URL website chính thức",
  "summary": "Tóm tắt 1 dòng (one-liner) về dự án và verdict sơ bộ",
  "scores": {
    "teamFounders":    { "score": null, "max": 10, "reasoning": "N/A — team chưa công khai danh tính ở giai đoạn sớm", "confidence": "Thấp" },
    "marketTiming":    { "score": 13, "max": 16, "reasoning": "Lý do chấm điểm...", "confidence": "Trung bình" },
    "productProblem":  { "score": 18, "max": 21, "reasoning": "Lý do chấm điểm...", "confidence": "Cao" },
    "techSecurity":    { "score": 14, "max": 17, "reasoning": "Lý do chấm điểm...", "confidence": "Thấp" },
    "tractionMetrics": { "score": 10, "max": 14, "reasoning": "Lý do chấm điểm...", "confidence": "Trung bình" },
    "businessMoat":    { "score": 9,  "max": 12, "reasoning": "Lý do chấm điểm...", "confidence": "Cao" },
    "tokenomics":      { "score": null, "max": 6,  "reasoning": "N/A — chưa công bố tokenomics chính thức", "confidence": "Thấp" },
    "dealValuation":   { "score": null, "max": 4,  "reasoning": "N/A — chưa có thông tin điều khoản và định giá", "confidence": "Thấp" }
  },
  "totalScore": 81,
  "detailedAssessment": "Đánh giá chi tiết tổng quan — kiểu memo nội bộ IC...",
  "strengths": ["Điểm mạnh 1", "Điểm mạnh 2", "Điểm mạnh 3"],
  "risks": ["Rủi ro 1", "Rủi ro 2", "Rủi ro 3"],
  "redFlags": ["Red flag 1 (nếu có)", "Red flag 2"],
  "recommendation": "INVEST / PASS / NEED MORE INFO — kèm lý do ngắn gọn",
  "questionsForFounder": ["Câu hỏi cần hỏi founder 1", "Câu hỏi 2", "Câu hỏi 3"]
}`;

  const userPrompt = `Tiến hành Due Diligence chuyên sâu cho dự án dưới đây. Đánh giá khắt khe, skeptical by default.
Website URL: ${url}
NỘI DUNG CÀO TỪ WEBSITE DỰ ÁN:
---
${scrapedText}
---
THÔNG TIN BỔ SUNG DO NGƯỜI DÙNG CUNG CẤP:
---
${rawInputText || '(Không có thông tin bổ sung)'}
---
Hãy sử dụng WEB SEARCH để thu thập dữ liệu mới nhất: team background (LinkedIn/Twitter), backers, funding rounds, on-chain metrics (TVL, volume, users từ DeFiLlama/Dune), GitHub activity, audit reports, community size thật (phân biệt bot), v.v. trước khi phân tích và lập bảng điểm.`;

  const makeApiCall = async (): Promise<string> => {
    const isOnlineModel = model.includes(':online');
    const payload: Record<string, any> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    };

    // Auto-formatting JSON bằng JSON Schema chỉ dành cho model uy tín hỗ trợ
    const supportsJsonFormat = ['google/', 'openai/', 'anthropic/', 'deepseek/'].some(prefix => model.startsWith(prefix));
    if (supportsJsonFormat) {
      payload.response_format = { type: 'json_object' };
    }
    // Auto web plugin chỉ kích hoạt cho model Online
    if (isOnlineModel) {
      payload.plugins = [{ id: 'web' }];
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/peter/crypto-research-app',
        'X-Title': 'Primus Research AI Scoring Engine'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices?.[0]?.message?.content || '';
  };

  const processAndNormalizeResult = (content: string): LLMResponse => {
    const rawResult = extractJson(content);
    let totalMaxPossible = 0;
    let totalAcquired = 0;

    const scoreKeys = ['teamFounders', 'marketTiming', 'productProblem', 'techSecurity', 'tractionMetrics', 'businessMoat', 'tokenomics', 'dealValuation'] as const;
    const maxScores = {
      teamFounders: 10,
      marketTiming: 16,
      productProblem: 21,
      techSecurity: 17,
      tractionMetrics: 14,
      businessMoat: 12,
      tokenomics: 6,
      dealValuation: 4
    };

    if (!rawResult.scores) rawResult.scores = {};

    for (const key of scoreKeys) {
      if (rawResult.scores[key]) {
        // Enforce maximum weight limits on server-side
        rawResult.scores[key].max = maxScores[key];
        const val = rawResult.scores[key].score;
        
        // Clean values "N/A" and convert to typescript null
        if (val !== null && val !== undefined && String(val).trim() !== 'N/A' && String(val).trim() !== '') {
          const num = Number(val);
          if (!isNaN(num)) {
            rawResult.scores[key].score = Math.max(0, Math.min(maxScores[key], num));
            totalAcquired += rawResult.scores[key].score;
            totalMaxPossible += maxScores[key];
          } else {
            rawResult.scores[key].score = null;
          }
        } else {
          rawResult.scores[key].score = null;
        }
      } else {
        rawResult.scores[key] = { score: null, max: maxScores[key], reasoning: 'Không đủ dữ liệu đánh giá.', confidence: 'Thấp' };
      }
    }

    // Dynamic Re-normalization calculation formula
    rawResult.totalScore = totalMaxPossible > 0 ? Math.round((totalAcquired / totalMaxPossible) * 100) : 0;
    return rawResult;
  };

  // Automated 1-time retry mechanism to enhance system resilience
  try {
    const res = await makeApiCall();
    return processAndNormalizeResult(res);
  } catch (error) {
    console.warn('Lần gọi OpenRouter đầu tiên thất bại. Thử lại sau 1.5 giây...', error);
    await new Promise(r => setTimeout(r, 1500));
    const res = await makeApiCall();
    return processAndNormalizeResult(res);
  }
}
```

---

### 5.4. Next.js Server Action (`src/app/actions.ts`)
**Nhiệm vụ**: Đóng vai trò là cầu nối API Controller. Server Actions này bảo vệ an toàn thông tin API keys. Thay vì dùng `throw` lỗi thô làm Next.js tự động ẩn tin nhắn chi tiết ở production, Server Action trả về kiểu `ActionResult<T>` cấu trúc rõ ràng.

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { saveProject, Project } from '@/lib/db';
import { scrapeWebsite } from '@/lib/scraper';
import { researchAndScoreProject } from '@/lib/openrouter';

export type ActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

export async function analyzeProjectAction(
  websiteUrl: string, 
  rawInputText = '',
  model?: string
): Promise<ActionResult<Project>> {
  if (!websiteUrl || websiteUrl.trim() === '') {
    return { success: false, error: 'URL dự án là bắt buộc.' };
  }

  try {
    // Luồng tuần tự: Scrape -> OpenRouter Research -> Save DB
    const scrapedText = await scrapeWebsite(websiteUrl);
    const llmResult = await researchAndScoreProject(websiteUrl, scrapedText, rawInputText, model);

    const savedProject = await saveProject({
      name: llmResult.projectName || 'Dự án ẩn danh',
      website: websiteUrl,
      total_score: llmResult.totalScore || 0,
      recommendation: llmResult.recommendation || 'Thiếu thông tin khuyến nghị',
      scores: llmResult.scores,
      summary: llmResult.summary || 'Không có tóm tắt.',
      detailed_assessment: llmResult.detailedAssessment || 'Không có đánh giá chi tiết.',
      strengths: llmResult.strengths || [],
      risks: llmResult.risks || [],
      red_flags: llmResult.redFlags || [],
      questions_for_founder: llmResult.questionsForFounder || [],
      raw_input: rawInputText || undefined
    });

    // Ép làm mới cache của router để dashboard cập nhật ngay dữ liệu mới
    revalidatePath('/');
    revalidatePath('/list');
    
    return { success: true, data: savedProject };

  } catch (error: any) {
    console.error('Lỗi phân tích dự án tại Server Action:', error);
    return { 
      success: false, 
      error: error.message || 'Đã xảy ra lỗi hệ thống trong quá trình phân tích dự án.' 
    };
  }
}
```

---

### 5.5. UI Scorecard component (`src/app/components/ProjectResult.tsx`)
**Nhiệm vụ**: Hiển thị báo cáo kết quả Due Diligence chuyên nghiệp. Chứa logic **crash-proof** chống sập ứng dụng khi truy vấn bản ghi cũ và các lớp CSS phong cách Cyberpunk, Glassmorphism tối ưu.

```typescript
import { Project } from '@/lib/db';
import { ExternalLink, CheckCircle2, AlertTriangle, HelpCircle, Award, Calendar, ShieldAlert, MessageCircleQuestion } from 'lucide-react';

interface ProjectResultProps {
  project: Project;
}

export default function ProjectResult({ project }: ProjectResultProps) {
  const {
    name,
    website,
    total_score,
    recommendation,
    scores,
    summary,
    detailed_assessment,
    strengths,
    risks,
    red_flags,
    questions_for_founder,
    created_at,
  } = project;

  // Quyết định màu sắc chủ đạo theo điểm số
  const getScoreStyles = (score: number) => {
    if (score >= 80) {
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        glow: 'glow-green',
        progress: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
      };
    } else if (score >= 60) {
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        glow: 'glow-yellow',
        progress: 'bg-gradient-to-r from-amber-600 to-amber-400',
      };
    } else {
      return {
        text: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        glow: 'glow-red',
        progress: 'bg-gradient-to-r from-rose-600 to-rose-400',
      };
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const level = confidence?.toLowerCase() || '';
    if (level === 'cao' || level === 'high') {
      return { text: 'text-emerald-300', bg: 'bg-emerald-500/15', label: 'Cao' };
    } else if (level.includes('trung') || level === 'medium') {
      return { text: 'text-amber-300', bg: 'bg-amber-500/15', label: 'TB' };
    } else {
      return { text: 'text-rose-300', bg: 'bg-rose-500/15', label: 'Thấp' };
    }
  };

  const getRecommendationStyle = (rec: string) => {
    const upper = rec?.toUpperCase() || '';
    if (upper.includes('INVEST')) {
      return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'INVEST' };
    } else if (upper.includes('PASS')) {
      return { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', label: 'PASS' };
    } else {
      return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'NEED MORE INFO' };
    }
  };

  const style = getScoreStyles(total_score);
  const recStyle = getRecommendationStyle(recommendation);

  // Crash-proof fallbacks: Phòng tránh sập giao diện khi tải dữ liệu cũ (lúc đó scores chưa có cấu trúc 8 tiêu chí mới)
  const getCategoryData = (key: string) => {
    const defaultData = { score: null, max: 0, reasoning: 'Không có dữ liệu cho mục này.', confidence: 'Thấp' };
    if (!scores) return defaultData;
    return (scores as any)[key] || defaultData;
  };

  const categories = [
    { key: 'teamFounders', label: 'Team & Founders', weight: '10%', ...getCategoryData('teamFounders') },
    { key: 'marketTiming', label: 'Thị trường & Timing', weight: '16%', ...getCategoryData('marketTiming') },
    { key: 'productProblem', label: 'Sản phẩm & Vấn đề', weight: '21%', ...getCategoryData('productProblem') },
    { key: 'techSecurity', label: 'Công nghệ & Bảo mật', weight: '17%', ...getCategoryData('techSecurity') },
    { key: 'tractionMetrics', label: 'Traction & Metrics', weight: '14%', ...getCategoryData('tractionMetrics') },
    { key: 'businessMoat', label: 'Mô hình KD & Moat', weight: '12%', ...getCategoryData('businessMoat') },
    { key: 'tokenomics', label: 'Tokenomics', weight: '6%', ...getCategoryData('tokenomics') },
    { key: 'dealValuation', label: 'Deal & Định giá', weight: '4%', ...getCategoryData('dealValuation') },
  ];

  const formattedDate = created_at ? new Date(created_at).toLocaleDateString('vi-VN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '';

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Tổng quan Dự án (Overview Header) */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        <div className={`absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl opacity-20 ${style.bg}`} />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm mb-1">
              <Calendar className="h-4 w-4" />
              <span>Đánh giá lúc: {formattedDate}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">{name}</h1>
            <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300">
              <span>{website}</span> <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="mt-4 text-slate-300 text-base max-w-2xl leading-relaxed">
              <span className="font-semibold text-slate-100">Verdict:</span> {summary}
            </p>
          </div>

          {/* Radial Score Circle */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <div className={`flex h-32 w-32 items-center justify-center rounded-full border-2 ${style.border} ${style.bg} ${style.glow} transition-all duration-500`}>
              <div className="text-center">
                <span className="block text-4xl font-black text-white">{total_score}</span>
                <span className="text-xs font-semibold uppercase text-slate-400">/ 100</span>
              </div>
            </div>
            <div className={`mt-3 rounded-full px-3 py-1 text-xs font-bold ${recStyle.bg} ${recStyle.text} border ${recStyle.border}`}>
              {recStyle.label}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Chi tiết Scorecard */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Award className="h-5 w-5 text-indigo-400" />
          <span>Scorecard — Bảng điểm Due Diligence chi tiết</span>
        </h2>
        
        {/* Header Table */}
        <div className="hidden sm:grid grid-cols-12 gap-2 mb-3 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <div className="col-span-4">Hạng mục</div>
          <div className="col-span-1 text-center">Trọng số</div>
          <div className="col-span-1 text-center">Điểm số</div>
          <div className="col-span-1 text-center">Tin cậy</div>
          <div className="col-span-5">Nhận xét chuyên sâu (Reasoning)</div>
        </div>

        <div className="space-y-4 sm:space-y-0 sm:divide-y sm:divide-white/5">
          {categories.map((cat) => {
            const isNA = cat.score === null || cat.score === undefined;
            const scorePercent = isNA ? 0 : (cat.score! / cat.max) * 100;
            
            const catStyles = isNA 
              ? { text: 'text-slate-500', bg: 'bg-slate-500/5', border: 'border-slate-500/10', glow: '', progress: 'bg-slate-700' } 
              : getScoreStyles(scorePercent);

            const confBadge = isNA
              ? { text: 'text-slate-400', bg: 'bg-slate-800/80', label: 'N/A' }
              : getConfidenceBadge(cat.confidence);

            return (
              <div key={cat.key} className={`sm:grid sm:grid-cols-12 sm:gap-2 sm:items-start sm:py-4 space-y-2 sm:space-y-0 transition-all duration-300 ${isNA ? 'opacity-50' : ''}`}>
                <div className="col-span-4 flex items-center gap-2">
                  <span className={`font-bold text-sm ${isNA ? 'text-slate-500' : 'text-slate-200'}`}>{cat.label}</span>
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-xs text-slate-500 font-semibold">{cat.weight}</span>
                </div>
                <div className="col-span-1 text-center">
                  {isNA ? (
                    <span className="text-xs font-bold text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">N/A</span>
                  ) : (
                    <>
                      <span className={`text-sm font-bold ${catStyles.text}`}>{cat.score}</span>
                      <span className="text-slate-500 text-xs">/{cat.max}</span>
                    </>
                  )}
                </div>
                <div className="col-span-1 text-center">
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${confBadge.bg} ${confBadge.text}`}>
                    {confBadge.label}
                  </span>
                </div>
                <div className="col-span-5">
                  <p className={`text-xs sm:text-sm leading-relaxed ${isNA ? 'text-slate-500 italic' : 'text-slate-400'}`}>
                    {cat.reasoning}
                  </p>
                </div>
                {/* Mobile Progress Indicator */}
                <div className="col-span-12 sm:hidden">
                  <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden">
                    <div className={`h-full rounded-full ${catStyles.progress} transition-all duration-1000`} style={{ width: `${scorePercent}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Phân tích SWOT (Điểm mạnh & Rủi ro) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 border-emerald-500/10">
          <h2 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" /> <span>Điểm Mạnh & Cơ Hội nổi bật</span>
          </h2>
          <ul className="space-y-3">
            {strengths.map((str, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                <span className="text-emerald-500 font-bold shrink-0">•</span> <span>{str}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-card rounded-2xl p-6 border-rose-500/10">
          <h2 className="text-lg font-bold text-rose-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> <span>Rủi Ro & Lỗ Hổng lớn</span>
          </h2>
          <ul className="space-y-3">
            {risks.map((risk, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                <span className="text-rose-500 font-bold shrink-0">•</span> <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 4. Cảnh báo Red Flags */}
      {red_flags && red_flags.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border-red-500/20 bg-red-500/[0.03]">
          <h2 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> <span>🚩 Danh sách Red Flags (Cảnh báo đỏ)</span>
          </h2>
          <ul className="space-y-3">
            {red_flags.map((flag, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                <span className="text-red-500 font-bold shrink-0">⚠</span> <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Memo đánh giá IC chi tiết */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-4">Ý Kiến Đánh Giá Trình IC</h2>
        <div className={`mb-6 rounded-xl border p-4 flex gap-3 ${recStyle.bg} ${recStyle.border}`}>
          <HelpCircle className={`h-6 w-6 ${recStyle.text} shrink-0 mt-0.5`} />
          <div>
            <h4 className={`text-base font-bold uppercase tracking-wide ${recStyle.text}`}>Khuyến nghị cuối</h4>
            <p className="text-slate-200 font-semibold text-sm sm:text-base mt-1">{recommendation}</p>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Đánh giá chi tiết toàn diện:</h4>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">{detailed_assessment}</p>
        </div>
      </div>

      {/* 6. Danh sách câu hỏi gửi Founders */}
      {questions_for_founder && questions_for_founder.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border-indigo-500/10">
          <h2 className="text-lg font-bold text-indigo-400 mb-4 flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5" /> <span>Câu hỏi chất vấn Ban Sáng Lập (Founders)</span>
          </h2>
          <ul className="space-y-3">
            {questions_for_founder.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span> <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## 6. HƯỚNG DẪN VẬN HÀNH & TRIỂN KHAI CHO AI MỚI

Nếu bạn muốn chuyển giao dự án này sang một AI Assistant khác hoặc thiết lập môi trường mới, hãy cung cấp cho AI các chỉ dẫn vận hành chuẩn hóa sau:

### 6.1. Thiết lập biến môi trường (`.env.local`)
Tạo tệp `.env.local` tại thư mục gốc với các khóa sau:
```text
OPENROUTER_API_KEY=your_openrouter_api_key
# Cấu hình Postgres (Neon/Vercel) - Nếu để trống, hệ thống tự động lưu file local_db/projects.json
DATABASE_URL=postgres://user:pass@host/dbname?sslmode=require
```

### 6.2. Chạy ứng dụng dưới môi trường Phát triển (Local Dev)
Cài đặt thư viện và chạy máy chủ phát triển cục bộ:
```bash
npm install
npm run dev
```
Mở trình duyệt truy cập địa chỉ `http://localhost:3000`.

### 6.3. Triển khai sản xuất lập tức (Vercel Production Deploy)
Biên dịch ứng dụng và cập nhật trực tiếp lên hạ tầng đám mây Vercel bằng cách chạy CLI:
```bash
npx vercel --prod --yes
```

---

## 7. MƯỜI ĐIỀU RĂN QUAN TRỌNG KHI AI KHÁC TIẾP QUẢN CODE (AI CODING GOTCHAS)

Để tránh phá vỡ kiến trúc hệ thống hiện có, bất kỳ AI nào tiếp quản chỉnh sửa dự án này đều phải tuân thủ nghiêm ngặt **10 quy tắc vàng** sau:

1. **Không được ném lỗi (`throw`) trong Server Actions**: Tiếp tục sử dụng mô hình kết quả `{ success: true, data } | { success: false, error }` (kiểu `ActionResult<T>`) ở `actions.ts`. Ném lỗi trong Server Action sẽ bị Next.js che giấu ở môi trường Production, làm người dùng chỉ nhận lỗi chung chung `"An error occurred"`.
2. **Không ép kiểu JSON bắt buộc cho Tencent và Qwen**: Khi gửi tham số payload tới OpenRouter, tuyệt đối tránh thêm cấu hình `response_format: { type: 'json_object' }` cho Tencent Hunyuan (`tencent/hy3-preview`) và Qwen (`qwen/...`) vì điều này khiến các model này trả về nội dung rỗng (empty content). Chỉ kích hoạt tham số này cho Google, OpenAI, Anthropic và DeepSeek.
3. **Không gửi Web Plugin cho model thường**: Tránh thêm `plugins: [{ id: 'web' }]` cho các model không kết thúc bằng hậu tố `:online` (chỉ Gemini Flash Online mới hỗ trợ chính thức).
4. **Tuyệt đối không được tính `totalScore` ở phía LLM**: LLM rất tệ trong việc làm toán và tính toán Re-normalization. Hãy để OpenRouter chỉ chấm điểm thô của từng hạng mục (hoặc gán `null`), và để hàm phụ trợ `processAndNormalizeResult` trên Node.js tính toán tổng điểm toán học chính xác 100%.
5. **Luôn sử dụng `getCategoryData` trong UI Component**: Để đảm bảo tính tương thích ngược, các trường dữ liệu điểm số trong cơ sở dữ liệu cũ có cấu trúc khác. UI hiển thị bắt buộc phải truy xuất điểm số qua hàm getter bọc ngoài này để tránh crash giao diện (lỗi sập trang trắng do `TypeError: Cannot read properties of undefined`).
6. **Không gán điểm `0` cho các mục N/A**: Khi LLM phân tích dự án giai đoạn sớm thiếu dữ liệu, điểm số của danh mục đó phải trả về chính xác là `null`. Gán điểm bằng `0` sẽ làm hỏng công thức tái chuẩn hóa thang điểm 100 và kéo sụt điểm tổng của dự án một cách oan uổng.
7. **Đồng bộ hóa tuyệt đối cấu trúc 8 tiêu chí**: Bất kỳ sự thay đổi nào về trọng số hoặc tên khóa (keys) của bộ chấm điểm đều phải được chỉnh sửa đồng bộ ở 4 vị trí: Prompt tiêu chí, OpenRouter system prompt, Hàm xử lý chuẩn hóa ở `openrouter.ts`, và Category rendering ở `ProjectResult.tsx`.
8. **Timeout Scraping 8 giây**: Không tăng thời gian cào trang web quá cao. Module cào dữ liệu `scraper.ts` bắt buộc phải tự động hủy tác vụ sau 8 giây để bảo vệ Server Actions không bị quá tải dẫn đến timeout hệ thống.
9. **Lọc nhiễu kỹ văn bản cào**: Cheerio phải strip sạch thẻ script, styles, header, footer để tránh đưa rác code làm phình to payload token làm cạn kiệt context của LLM.
10. **Auto-migration an toàn**: Khi bổ sung các cột mới vào Postgres DB, luôn khai báo lệnh truy vấn `ALTER TABLE projects ADD COLUMN IF NOT EXISTS` trong hàm khởi tạo cơ sở dữ liệu `ensureTable()` để đảm bảo serverless tự động nâng cấp trơn tru không gây lỗi truy cập bảng.

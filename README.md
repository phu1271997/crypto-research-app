# Crypto Research & Scoring Web App 🚀

Ứng dụng tự động hóa quy trình phân tích dự án tiền điện tử (Crypto) dựa trên trí tuệ nhân tạo AI. Chỉ cần nhập đường dẫn website dự án, hệ thống sẽ tiến hành **cào website trực tiếp**, thực hiện **Web Search thời gian thực** (để quét thêm backers, các vòng gọi vốn, định giá, cộng đồng) và tự động chấm điểm trên **thang điểm 100** chuẩn hóa. Tất cả báo cáo được lưu trữ trực quan để theo dõi và so sánh.

---

## ✨ Các Tính Năng Nổi Bật

- **🌐 Live Web Scraper**: Cào nội dung website thời gian thực, lọc mã HTML thừa để tối ưu hóa ngữ cảnh đưa vào LLM.
- **🔍 Real-time Web Search (OpenRouter + Gemini)**: Kích hoạt khả năng quét dữ liệu internet thực tế tìm kiếm backers (quỹ đầu tư), định giá (valuation), vòng gọi vốn (funding rounds), và số liệu mạng xã hội mới nhất.
- **📊 Bảng Chấm Điểm 100 Điểm**: Hệ thống chấm điểm chi tiết 7 tiêu chí theo cấu trúc:
  1. *Mô hình dự án (Project Model)*: 0–20 điểm
  2. *Mô hình kinh doanh (Business Model)*: 0–20 điểm
  3. *Thiết kế token (Tokenomics)*: 0–20 điểm
  4. *Quỹ đầu tư (Backers)*: 0–10 điểm
  5. *Độ phủ cộng đồng (Community)*: 0–10 điểm
  6. *Đội ngũ & Tiến độ (Team/Roadmap)*: 0–10 điểm
  7. *Tính hợp lý định giá (Valuation)*: 0–10 điểm
- **💾 Auto-Sync Database (PostgreSQL / local DB fallback)**: Lưu trữ báo cáo tự động vào PostgreSQL. Nếu chưa có database, hệ thống sẽ **tự động fallback về file JSON nội bộ** giúp ứng dụng hoạt động ngay tức thì khi chạy thử local!
- **⚡ Next.js App Router (Server-Side Secure)**: Tránh rò rỉ API key ra client. Tất cả API keys và truy vấn DB được xử lý hoàn toàn server-side.
- **🎨 Giao Diện Premium Dark Mode**: Thiết kế tối giản, cyberpunk hiện đại với các màu sắc điểm số trực quan (Emerald cho $\ge 80$, Amber cho $60$-$79$, Crimson cho $< 60$).

---

## 🛠️ Hướng Dẫn Chạy Môi Trường Cục Bộ (Local)

### 1. Chuẩn Bị
Yêu cầu máy tính đã cài đặt **Node.js (phiên bản v18+)** và **npm**.

### 2. Cài Đặt Dự Án
```bash
# Di chuyển vào thư mục dự án và cài đặt dependencies
npm install
```

### 3. Cấu Hình Environment Variables (Biến môi trường)
Tạo file `.env.local` ở thư mục gốc của dự án bằng cách copy từ `.env.example`:
```bash
cp .env.example .env.local
```
Mở file `.env.local` vừa tạo và điền các giá trị:
- **`OPENROUTER_API_KEY`**: Đăng ký miễn phí/trả phí tại [OpenRouter.ai](https://openrouter.ai) để lấy API key.
- **`DATABASE_URL`**: Kết nối database PostgreSQL. 
  > **💡 Mẹo:** Nếu bạn không điền `DATABASE_URL`, ứng dụng vẫn chạy bình thường trên local bằng cách lưu trữ dữ liệu vào thư mục cục bộ `.local_db/projects.json`!

### 4. Khởi Chạy Ứng Dụng
```bash
npm run dev
```
Mở [http://localhost:3000](http://localhost:3000) trên trình duyệt của bạn để trải nghiệm hệ thống.

---

## 🌐 Hướng Dẫn Triển Khai lên Vercel (Production)

### Bước 1: Chuẩn bị Github Repository
Đẩy mã nguồn dự án lên kho lưu trữ Github riêng tư hoặc công khai của bạn.

### Bước 2: Tạo dự án mới trên Vercel
1. Truy cập [Vercel Dashboard](https://vercel.com) và bấm **Add New** -> **Project**.
2. Liên kết tài khoản Github của bạn và chọn Repository chứa dự án này.
3. Bấm **Deploy**. (Lần build đầu tiên có thể hoàn thành nhanh chóng).

### Bước 3: Cài đặt Database PostgreSQL trên Vercel
1. Tại trang Dashboard dự án trên Vercel, chuyển sang tab **Storage**.
2. Chọn **Postgres** -> Bấm **Create**.
3. Chọn khu vực server gần bạn nhất (ví dụ: Singapore hoặc Hong Kong cho độ trễ tối ưu từ Việt Nam) và bấm **Create**.
4. Sau khi khởi tạo xong, hệ thống sẽ tự động liên kết cơ sở dữ liệu với dự án của bạn và tạo các biến môi trường cần thiết (bao gồm cả `DATABASE_URL`).

### Bước 4: Thêm Biến Môi Trường cho OpenRouter
1. Vào tab **Settings** -> **Environment Variables** trên Vercel.
2. Thêm biến mới:
   - **`OPENROUTER_API_KEY`**: Điền API key OpenRouter của bạn.
3. Bấm **Save**.

### Bước 5: Redeploy (Triển khai lại)
1. Vào tab **Deployments** trên Vercel.
2. Bấm vào nút ba chấm ở bản build gần nhất và chọn **Redeploy** (hoặc kích hoạt bản build mới bằng cách commit code lên Github).
3. Ứng dụng sẽ tự động kết nối với cơ sở dữ liệu Vercel Postgres, tự khởi tạo bảng `projects` trong cơ sở dữ liệu PostgreSQL ở lần phân tích dự án đầu tiên và sẵn sàng phục vụ!

---

## 📂 Cấu Trúc Thư Mục Chính

```text
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── Navbar.tsx         # Thanh điều hướng header
│   │   │   └── ProjectResult.tsx  # Giao diện hiển thị chi tiết điểm & phân tích
│   │   ├── list/
│   │   │   └── page.tsx           # Trang danh sách dự án (tìm kiếm, sắp xếp, xóa)
│   │   ├── project/[id]/
│   │   │   └── page.tsx           # Trang chi tiết xem lại dự án theo UUID
│   │   ├── actions.ts             # Các Server Actions kết nối scraper, LLM và DB
│   │   ├── globals.css            # CSS toàn cục, định dạng theme Dark-Cyberpunk
│   │   └── layout.tsx             # Cấu trúc HTML cơ bản, font chữ và SEO tags
│   └── lib/
│       ├── db.ts                  # Lớp kết nối PostgreSQL và fallback cục bộ
│       ├── scraper.ts             # Bộ cào website, strip HTML, xử lý timeout
│       └── openrouter.ts          # Bộ tích hợp API OpenRouter Gemini Online
├── .env.example                   # Biến môi trường mẫu
└── README.md                      # Hướng dẫn sử dụng chi tiết
```

Chúc bạn có những trải nghiệm nghiên cứu đầu tư hiệu quả với **CryptoResearch AI**! 🚀

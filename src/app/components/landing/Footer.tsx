'use client';

import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="w-full bg-[#0A0A1A] border-t border-white/5 pt-16 pb-8 z-10 relative">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16 mb-12">
          
          {/* Column 1: Logo & Tagline */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)] overflow-hidden">
                <Image
                  src="/primus-logo.svg"
                  alt="Primus Logo"
                  width={32}
                  height={32}
                  priority
                />
              </div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-50 to-indigo-300 bg-clip-text text-transparent">
                Primus Research <span className="text-indigo-400 font-medium">AI</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Due Diligence Engine cho Crypto VC. Tự động hóa quá trình nghiên cứu, thẩm định và đánh giá dự án Crypto chuẩn mực, khách quan.
            </p>
          </div>

          {/* Column 2: Features */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              Tính Năng
            </h4>
            <ul className="space-y-2 text-xs text-slate-500">
              <li>
                <a href="/login" className="hover:text-indigo-400 transition-colors">
                  Research Dự Án
                </a>
              </li>
              <li>
                <a href="/list" className="hover:text-indigo-400 transition-colors">
                  Watchlist Theo Dõi
                </a>
              </li>
              <li>
                <a href="/login" className="hover:text-indigo-400 transition-colors">
                  Weekly Track
                </a>
              </li>
              <li>
                <a href="/admin" className="hover:text-indigo-400 transition-colors">
                  Viết Bài & Social Bot
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Tech Stack */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              Công Nghệ
            </h4>
            <ul className="space-y-2 text-xs text-slate-500">
              <li className="hover:text-indigo-400 transition-colors cursor-pointer">OpenRouter AI API</li>
              <li className="hover:text-indigo-400 transition-colors cursor-pointer">Google Gemini 3.5 Online</li>
              <li className="hover:text-indigo-400 transition-colors cursor-pointer">Neon Serverless Postgres</li>
              <li className="hover:text-indigo-400 transition-colors cursor-pointer">Vercel App Router Security</li>
            </ul>
          </div>

        </div>

        {/* Bottom copyright block */}
        <div className="border-t border-white/5 pt-6 text-center">
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} Primus Research AI. Mọi quyền được bảo lưu.
          </p>
        </div>

      </div>
    </footer>
  );
}

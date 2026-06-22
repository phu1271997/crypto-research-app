'use client';

import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

export default function Hero() {
  const scrollToHowItWorks = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById('how-it-works');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden py-12 md:py-20">
      {/* Background Gradient & Grid Pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A1A] via-[#0E0B25] to-[#1A1040] pointer-events-none z-0" />
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Decorative Glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none z-0 animate-pulse-slow" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[300px] h-[300px] rounded-full bg-purple-500/10 blur-[100px] pointer-events-none z-0" />

      <div className="container mx-auto px-4 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column (60%) */}
          <div className="lg:col-span-7 space-y-6 md:space-y-8 text-left animate-in fade-in slide-in-from-left-6 duration-1000">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/5 px-3 py-1 text-xs md:text-sm font-medium text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-indigo-300" />
              <span>🛡️ VC Due Diligence Engine</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.15] md:leading-[1.1]">
              <span className="bg-gradient-to-r from-indigo-400 via-indigo-200 to-purple-400 bg-clip-text text-transparent">
                Primus Spark
              </span>
              <br />
              Research
            </h1>

            {/* Subheadline */}
            <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-lg">
              Tự động chấm điểm dự án Web3 theo bộ 8 tiêu chí VC Due Diligence.
              Kết hợp AI & Real-time Web Search. Nhận kết quả trong 60 giây.
            </p>

            {/* CTA Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <a
                href="/login"
                className="group flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all duration-200"
              >
                <span>Bắt Đầu Research</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
              
              <a
                href="#how-it-works"
                onClick={scrollToHowItWorks}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-8 py-4 text-sm font-semibold text-slate-300 hover:text-white transition duration-200"
              >
                <span>Xem Cách Hoạt Động</span>
              </a>
            </div>
          </div>

          {/* Right Column (40% - Premium Interactive Mockup) */}
          <div className="lg:col-span-5 flex justify-center items-center lg:pl-6 animate-in fade-in slide-in-from-right-6 duration-1000 delay-200">
            <div className="relative w-full max-w-[400px] transform hover:rotate-0 rotate-3 transition-transform duration-500 cursor-pointer">
              
              {/* Outer Glowing Border */}
              <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-r from-indigo-500/30 to-purple-500/30 opacity-50 blur-lg" />

              {/* Main Card View */}
              <div className="relative bg-[#0d0f22]/80 backdrop-blur-2xl border border-indigo-500/20 rounded-3xl p-6 shadow-2xl">
                
                {/* Header elements */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white leading-none">Monad Network</h4>
                      <span className="text-[10px] text-indigo-400 font-medium">monad.xyz</span>
                    </div>
                  </div>
                  
                  {/* Verdict Badge */}
                  <div className="flex flex-col items-end">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      INVEST
                    </span>
                    <span className="text-[9px] text-slate-500 mt-1">Confidence: Cao</span>
                  </div>
                </div>

                {/* Score Big Display */}
                <div className="text-center py-4 bg-indigo-950/20 border border-indigo-500/10 rounded-2xl mb-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">VC DD Total Score</span>
                  <div className="flex items-baseline justify-center gap-1 mt-1">
                    <span className="text-5xl font-black bg-gradient-to-r from-emerald-400 to-indigo-300 bg-clip-text text-transparent">87</span>
                    <span className="text-slate-500 text-sm font-bold">/100</span>
                  </div>
                </div>

                {/* Category Score Mock Checklist */}
                <div className="space-y-3.5">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-semibold">Sản Phẩm & Vấn Đề (Moat)</span>
                      <span className="text-indigo-400 font-bold">19 / 21</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: '90.4%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-semibold">Công Nghệ & Bảo Mật</span>
                      <span className="text-indigo-400 font-bold">15 / 17</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: '88.2%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-semibold">Mô Hình KD & Moat</span>
                      <span className="text-indigo-400 font-bold">11 / 12</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: '91.6%' }} />
                    </div>
                  </div>
                </div>

                {/* Bottom Strengths Pills */}
                <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> Parallel Execution
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-slate-300">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> EVM Compatible
                  </span>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

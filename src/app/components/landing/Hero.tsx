'use client';

export default function Hero() {
  const scrollToHowItWorks = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById('how-it-works');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[75vh] flex items-center justify-center overflow-hidden py-12 md:py-16">
      {/* Background Gradient & Grid Pattern */}
      <div className="absolute inset-0 bg-bg pointer-events-none z-0" />
      
      {/* Subtle background atmosphere - single radial gradient */}
      <div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: 'radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--brand) 6%, transparent), transparent 60%)',
          backgroundAttachment: 'fixed'
        }}
      />

      <div className="container mx-auto px-4 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column (60%) */}
          <div className="lg:col-span-7 space-y-6 text-left animate-in fade-in slide-in-from-left-6 duration-1000">
            {/* Pill Badge / Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-soft px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-brand shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_0_3px_rgba(45,212,191,0.15)] animate-pulse" />
              <span>Automated VC Due Diligence</span>
            </div>

            {/* Headline using Sora 800 */}
            <h1 className="font-display font-[800] text-4xl sm:text-5xl md:text-[3.2rem] leading-[1.1] text-text tracking-tighter">
              Chấm điểm dự án crypto theo chuẩn <span className="text-brand">quỹ đầu tư</span>.
            </h1>

            {/* Subheadline / Lede */}
            <p className="text-text-2 text-sm sm:text-base md:text-lg leading-relaxed max-w-xl">
              Dán URL dự án. Hệ thống cào website, quét backers &amp; định giá theo thời gian thực, rồi chấm điểm trên thang 100 với reasoning minh bạch cho từng tiêu chí.
            </p>

            {/* CTA Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 px-8 py-3.5 text-sm font-display font-semibold text-[#052e2a] shadow transition duration-200 cursor-pointer"
              >
                <span>Bắt Đầu Research</span>
                <svg className="h-4 w-4 stroke-[#052e2a] fill-none stroke-[2] stroke-linecap-round stroke-linejoin-round" viewBox="0 0 24 24">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </a>
              
              <a
                href="#how-it-works"
                onClick={scrollToHowItWorks}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-2 hover:bg-surface-hover px-8 py-3.5 text-sm font-display font-semibold text-text hover:text-white transition duration-200 cursor-pointer"
              >
                <span>Xem Cách Hoạt Động</span>
              </a>
            </div>

            {/* Trust Row / Specs */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 mt-8 pt-4 border-t border-border text-text-3 text-xs md:text-sm font-mono">
              <div><b className="text-text font-display font-bold">8</b> tiêu chí VC</div>
              <div><b className="text-text font-display font-bold">Real-time</b> web search</div>
              <div><b className="text-text font-display font-bold">Red-flag</b> detection</div>
              <div><b className="text-text font-display font-bold">Reasoning</b> minh bạch từng điểm</div>
            </div>
          </div>

          {/* Right Column (40% - Premium Fintech Mockup) */}
          <div className="lg:col-span-5 flex justify-center items-center lg:pl-6 animate-in fade-in slide-in-from-right-6 duration-1000 delay-200">
            <div className="relative w-full max-w-[400px] transform hover:rotate-0 rotate-3 transition-transform duration-500 cursor-pointer">
              
              {/* Outer Glow Border */}
              <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-r from-brand/20 to-brand-soft/20 opacity-30 blur-lg" />

              {/* Main Card View */}
              <div className="relative bg-surface border border-border rounded-2xl p-6 shadow-lg">
                
                {/* Header elements */}
                <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-2 to-brand flex items-center justify-center text-[#052e2a] font-display font-black text-sm shadow-sm">
                      M
                    </div>
                    <div>
                      <h4 className="text-sm font-display font-bold text-text leading-none">Monad Network</h4>
                      <span className="text-[10px] text-text-3 font-mono mt-1 block">monad.xyz</span>
                    </div>
                  </div>
                  
                  {/* Verdict Badge */}
                  <div className="flex flex-col items-end">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-[9px] font-display font-bold text-brand border border-brand-border uppercase tracking-wider">
                      INVEST
                    </span>
                    <span className="text-[9px] text-text-3 font-mono mt-1">Confidence: Cao</span>
                  </div>
                </div>

                {/* Score Big Display with SVG Progress Ring */}
                <div className="flex items-center justify-between p-4 bg-surface-2 border border-border rounded-xl mb-5">
                  <div className="space-y-1">
                    <span className="text-[10px] text-text-3 font-mono uppercase tracking-wider block">VC DD Rating</span>
                    <span className="text-xs text-text-2 leading-tight block max-w-[160px]">Perp DEX dẫn đầu về thanh khoản và traction thực.</span>
                  </div>
                  <div className="relative h-20 w-20 flex-shrink-0">
                    {/* SVG Progress Ring */}
                    <svg className="-rotate-90" width="80" height="80" viewBox="0 0 80 80">
                      <circle className="stroke-border-strong" cx="40" cy="40" r="34" fill="none" strokeWidth="6"/>
                      <circle 
                        className="stroke-brand" 
                        cx="40" 
                        cy="40" 
                        r="34" 
                        fill="none" 
                        strokeWidth="6" 
                        strokeLinecap="round"
                        strokeDasharray="213.6" 
                        strokeDashoffset="49.1"
                        style={{ transition: 'stroke-dashoffset 1s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="font-display font-extrabold text-lg text-text leading-none">77</span>
                      <span className="text-[8px] text-text-3 font-mono tracking-wider mt-0.5">/ 100</span>
                    </div>
                  </div>
                </div>

                {/* Category Score Checklist */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span className="text-text-2">Sản Phẩm &amp; Vấn Đề (Moat)</span>
                      <span className="text-brand font-bold">19 / 21</span>
                    </div>
                    <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: '90%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span className="text-text-2">Công Nghệ &amp; Bảo Mật</span>
                      <span className="text-brand font-bold">14 / 17</span>
                    </div>
                    <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: '82%' }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span className="text-text-2">Traction &amp; Metrics</span>
                      <span className="text-brand font-bold">12 / 14</span>
                    </div>
                    <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: '85%' }} />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

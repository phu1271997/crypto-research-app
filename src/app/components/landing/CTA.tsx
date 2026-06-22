'use client';

import { ArrowRight, Sparkles } from 'lucide-react';

export default function CTA({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  return (
    <section className="relative w-full py-16 md:py-24 overflow-hidden z-10">
      <div className="container mx-auto px-4 max-w-5xl">
        
        {/* Background banner container */}
        <div className="relative rounded-3xl bg-surface border border-border p-8 md:p-16 text-center overflow-hidden shadow-md">
          
          {/* Subtle grid pattern background */}
          <div 
            className="absolute inset-0 opacity-[0.02] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
              backgroundSize: '20px 20px'
            }}
          />
          
          {/* Decorative blur spheres */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[150px] rounded-full bg-brand-soft/10 blur-[80px] pointer-events-none" />

          {/* Content */}
          <div className="relative z-10 max-w-2xl mx-auto space-y-6 md:space-y-8">
            
            {/* Small icon overlay */}
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft border border-brand-border text-brand mx-auto">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>

            <h2 className="text-3xl md:text-5xl font-display font-extrabold text-text tracking-tight leading-tight">
              Sẵn Sàng Nghiên Cứu
              <br />
              Như Một VC?
            </h2>
            
            <p className="text-text-3 text-sm md:text-base max-w-md mx-auto">
              Chỉ cần dán URL website của dự án cần thẩm định.
              Để AI của chúng tôi lo trọn gói phần còn lại.
            </p>

            <div className="pt-2">
              <a
                href={isAuthenticated ? "/research" : "/login"}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 text-[#052e2a] px-8 py-4 text-sm font-display font-bold shadow transition-all duration-200 cursor-pointer"
              >
                <span>Bắt Đầu Ngay</span>
                <ArrowRight className="h-4.5 w-4.5" />
              </a>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}

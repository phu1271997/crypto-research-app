'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function CTA() {
  return (
    <section className="relative w-full py-16 md:py-24 overflow-hidden z-10">
      <div className="container mx-auto px-4 max-w-5xl">
        
        {/* Background gradient banner container */}
        <div className="relative rounded-3xl bg-gradient-to-r from-indigo-950 via-[#0e0c27] to-black border border-indigo-500/20 p-8 md:p-16 text-center overflow-hidden shadow-2xl">
          
          {/* Subtle grid pattern background */}
          <div 
            className="absolute inset-0 opacity-[0.02] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
              backgroundSize: '20px 20px'
            }}
          />
          
          {/* Decorative blur spheres */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[150px] rounded-full bg-indigo-500/10 blur-[80px] pointer-events-none" />

          {/* Content */}
          <div className="relative z-10 max-w-2xl mx-auto space-y-6 md:space-y-8">
            
            {/* Small icon overlay */}
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
              Sẵn Sàng Nghiên Cứu
              <br />
              Như Một VC?
            </h2>
            
            <p className="text-slate-400 text-sm md:text-base max-w-md mx-auto">
              Chỉ cần dán URL website của dự án cần thẩm định.
              Để AI của chúng tôi lo trọn gói phần còn lại.
            </p>

            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-slate-100 text-indigo-950 px-8 py-4 text-sm font-bold shadow-lg hover:scale-105 active:scale-[0.98] transition-all duration-200"
              >
                <span>Bắt Đầu Ngay</span>
                <ArrowRight className="h-4.5 w-4.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}

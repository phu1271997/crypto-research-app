'use client';

import { Link2, Brain, BarChart3, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

const steps = [
  {
    icon: Link2,
    iconColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    number: '01',
    title: 'Dán URL Dự Án',
    desc: 'Website, whitepaper, pitch deck — hệ thống tự động cào và trích xuất nội dung thô trực tiếp từ website của dự án.'
  },
  {
    icon: Brain,
    iconColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    number: '02',
    title: 'AI & Web Search',
    desc: '10+ model AI tiến hành tra cứu dữ liệu thời gian thực: quỹ đầu tư, GitHub, audit, on-chain TVL, và các số liệu cộng đồng.'
  },
  {
    icon: BarChart3,
    iconColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    number: '03',
    title: 'Nhận Báo Cáo Hoàn Chỉnh',
    desc: 'Bảng điểm 8 tiêu chí chuẩn VC, phát hiện Red Flags, đề xuất câu hỏi cho Founder, sẵn sàng trình Hội đồng đầu tư.'
  }
];

export default function HowItWorks() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Simple intersection observer behavior logic
    setIsVisible(true);
  }, []);

  return (
    <section id="how-it-works" className="relative w-full bg-[#0A0A1A] py-20 md:py-28 overflow-hidden z-10">
      {/* Background Gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 max-w-6xl">
        
        {/* Section Header */}
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-16 md:mb-20">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            Quy Trình Phân Tích
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Từ URL dự án đến báo cáo Due Diligence chuyên sâu chỉ trong 3 bước đơn giản
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 relative items-stretch">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative flex flex-col group h-full">
                
                {/* Desktop Arrow Connector */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-[calc(100%+1.5rem)] -translate-x-1/2 z-20 pointer-events-none">
                    <ArrowRight className="h-6 w-6 text-slate-700 group-hover:text-indigo-500 transition-colors duration-300" />
                  </div>
                )}

                {/* Step Card */}
                <div 
                  className={`flex-grow bg-[#0d0f22]/50 backdrop-blur-sm border border-white/5 hover:border-indigo-500/30 rounded-3xl p-8 hover:bg-[#0d0f22]/80 transition-all duration-300 shadow-xl flex flex-col items-start text-left relative overflow-hidden transform ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  }`}
                  style={{ transitionDelay: `${index * 150}ms` }}
                >
                  {/* Decorative Number Badge */}
                  <div className="absolute top-4 right-6 text-5xl font-black text-white/5 pointer-events-none select-none">
                    {step.number}
                  </div>

                  {/* Icon Circular Viewport */}
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${step.iconColor} shadow-[0_0_15px_rgba(99,102,241,0.05)] mb-6`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Info Blocks */}
                  <h3 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-400 transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {step.desc}
                  </p>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}

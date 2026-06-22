'use client';

import { Award } from 'lucide-react';
import { useEffect, useState } from 'react';

const criteria = [
  { name: 'Team & Founders', maxScore: 10, percent: '10%' },
  { name: 'Thị Trường & Timing', maxScore: 16, percent: '16%' },
  { name: 'Sản Phẩm & Vấn Đề', maxScore: 21, percent: '21%' },
  { name: 'Công Nghệ & Bảo Mật', maxScore: 17, percent: '17%' },
  { name: 'Traction & Metrics', maxScore: 14, percent: '14%' },
  { name: 'Mô Hình KD & Moat', maxScore: 12, percent: '12%' },
  { name: 'Tokenomics', maxScore: 6, percent: '6%' },
  { name: 'Deal & Định Giá', maxScore: 4, percent: '4%' }
];

export default function Framework() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative w-full bg-[#0F0F23] py-20 md:py-28 overflow-hidden z-10">
      {/* Decorative Glow background */}
      <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] rounded-full bg-purple-500/5 blur-[100px] pointer-events-none" />

      <div className="container mx-auto px-4 max-w-6xl">
        
        {/* Section Header */}
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-16">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2">
            <Award className="h-5 w-5" />
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            8 Tiêu Chí Chấm Điểm
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Khung đánh giá Due Diligence chuẩn VC, trọng số tối ưu hóa theo thực tế dự án giai đoạn đầu
          </p>
        </div>

        {/* 4x2 Grid (Desktop) / 2x4 Grid (Mobile) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {criteria.map((item, index) => (
            <div 
              key={index}
              className={`bg-gray-900/60 backdrop-blur-sm border border-gray-800/80 hover:border-indigo-500/30 rounded-2xl p-5 hover:bg-gray-900 transition-all duration-300 transform flex flex-col justify-between ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
              style={{ transitionDelay: `${index * 80}ms` }}
            >
              <div>
                {/* Score value */}
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm font-semibold text-indigo-400">
                    Max: {item.maxScore}đ
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold bg-white/5 px-2 py-0.5 rounded">
                    Trọng số: {item.percent}
                  </span>
                </div>
                
                {/* Title */}
                <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                  {item.name}
                </h3>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" 
                    style={{ width: `${(item.maxScore / 21) * 100}%` }} // Product has max weight (21)
                  />
                </div>
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

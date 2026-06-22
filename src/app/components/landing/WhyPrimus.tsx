'use client';

import { Scale, Globe, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

const benefits = [
  {
    icon: Scale,
    iconColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    title: 'Khách Quan & Không Thiên Vị',
    desc: 'Đánh giá dựa trên bằng chứng dữ liệu thực tế. Loại bỏ hoàn toàn FOMO, shill card và các thủ thuật marketing thổi phồng.'
  },
  {
    icon: Globe,
    iconColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    title: 'Web Search Thời Gian Thực',
    desc: 'Kiểm tra chéo lập tức dữ liệu on-chain, hoạt động mã nguồn GitHub, backers xác thực và lượng tương tác cộng đồng thực tế.'
  },
  {
    icon: RefreshCw,
    iconColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    title: 'Chuẩn Hóa Điểm Số Thông Minh',
    desc: 'Tự động bỏ qua các mục chưa công bố (ví dụ: Tokenomics) và tái phân bổ trọng số điểm. Đảm bảo không trừ điểm oan.'
  }
];

export default function WhyPrimus() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative w-full bg-[#0A0A1A] py-20 md:py-28 overflow-hidden z-10">
      <div className="container mx-auto px-4 max-w-6xl">
        
        {/* Section Title */}
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            Điểm Khác Biệt Của Primus AI
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Công nghệ giúp đơn giản hóa quy trình thẩm định phức tạp của các quỹ đầu tư
          </p>
        </div>

        {/* 3 columns grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div 
                key={index}
                className={`flex flex-col items-center md:items-start text-center md:text-left p-6 rounded-2xl hover:bg-white/[0.02] border border-transparent hover:border-white/5 transition-all duration-300 transform ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                }`}
                style={{ transitionDelay: `${index * 150}ms` }}
              >
                {/* Circular Icon Wrapper */}
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${benefit.iconColor} shadow-[0_0_15px_rgba(99,102,241,0.05)] mb-6`}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-white mb-3">
                  {benefit.title}
                </h3>
                
                <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
                  {benefit.desc}
                </p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}

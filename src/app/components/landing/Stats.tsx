'use client';

import { useEffect, useState } from 'react';

const statsData = [
  { value: '8', label: 'Tiêu Chí VC DD' },
  { value: '10+', label: 'AI Models Kết Nối' },
  { value: 'Real-time', label: 'Web Search Trực Tuyến' },
  { value: '100 điểm', label: 'Thang Đánh Giá Chuẩn' }
];

export default function Stats() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative w-full bg-[#0F0F23] border-y border-white/5 py-8 md:py-10 overflow-hidden z-10">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
      
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 items-center justify-center">
          
          {statsData.map((stat, index) => (
            <div 
              key={index} 
              className={`flex flex-col items-center justify-center text-center transition-all duration-700 transform ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              } ${
                index > 0 ? 'lg:border-l lg:border-white/5' : ''
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <span className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
                {stat.value}
              </span>
              <span className="text-xs sm:text-sm text-slate-500 font-medium mt-1.5 uppercase tracking-wider">
                {stat.label}
              </span>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}

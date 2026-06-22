'use client';

import { Project } from '@/lib/db';
import { ExternalLink, CheckCircle2, AlertTriangle, HelpCircle, Award, Calendar, ShieldAlert, MessageCircleQuestion } from 'lucide-react';

interface ProjectResultProps {
  project: Project;
}

export default function ProjectResult({ project }: ProjectResultProps) {
  const {
    name,
    website,
    total_score,
    recommendation,
    scores,
    summary,
    detailed_assessment,
    strengths,
    risks,
    red_flags,
    questions_for_founder,
    created_at,
  } = project;

  // Determine colors based on scores - using Institutional Fintech Tokens
  const getScoreStyles = (score: number) => {
    if (score >= 80) {
      return {
        text: 'text-pos',
        bg: 'bg-pos-soft',
        border: 'border-pos-bd',
        glow: '',
        progress: 'bg-pos',
        stroke: 'stroke-pos',
      };
    } else if (score >= 60) {
      return {
        text: 'text-warn',
        bg: 'bg-warn-soft',
        border: 'border-warn-bd',
        glow: '',
        progress: 'bg-warn',
        stroke: 'stroke-warn',
      };
    } else {
      return {
        text: 'text-neg',
        bg: 'bg-neg-soft',
        border: 'border-neg-bd',
        glow: '',
        progress: 'bg-neg',
        stroke: 'stroke-neg',
      };
    }
  };

  // Confidence badge colors
  const getConfidenceBadge = (confidence: string) => {
    const level = confidence?.toLowerCase() || '';
    if (level === 'cao' || level === 'high') {
      return { text: 'text-pos', bg: 'bg-pos-soft', label: 'CAO' };
    } else if (level.includes('trung') || level === 'medium') {
      return { text: 'text-warn', bg: 'bg-warn-soft', label: 'TB' };
    } else {
      return { text: 'text-neg', bg: 'bg-neg-soft', label: 'THẤP' };
    }
  };

  // Recommendation badge
  const getRecommendationStyle = (rec: string) => {
    const upper = rec?.toUpperCase() || '';
    if (upper.includes('INVEST')) {
      return { text: 'text-pos', bg: 'bg-pos-soft', border: 'border-pos-bd', label: 'INVEST' };
    } else if (upper.includes('PASS')) {
      return { text: 'text-neg', bg: 'bg-neg-soft', border: 'border-neg-bd', label: 'PASS' };
    } else {
      return { text: 'text-warn', bg: 'bg-warn-soft', border: 'border-warn-bd', label: 'NEED MORE INFO' };
    }
  };

  const style = getScoreStyles(total_score);
  const recStyle = getRecommendationStyle(recommendation);

  // Safely extract score data to avoid crashes if keys are missing from older DB entries
  const getCategoryData = (key: string) => {
    const defaultData = { score: null, max: 0, reasoning: 'Không có dữ liệu.', confidence: 'Thấp' };
    if (!scores) return defaultData;
    return (scores as any)[key] || defaultData;
  };

  const categories = [
    { key: 'teamFounders', label: 'Team & Founders', weight: '10%', ...getCategoryData('teamFounders') },
    { key: 'marketTiming', label: 'Thị trường & Timing', weight: '16%', ...getCategoryData('marketTiming') },
    { key: 'productProblem', label: 'Sản phẩm & Vấn đề', weight: '21%', ...getCategoryData('productProblem') },
    { key: 'techSecurity', label: 'Công nghệ & Bảo mật', weight: '17%', ...getCategoryData('techSecurity') },
    { key: 'tractionMetrics', label: 'Traction & Metrics', weight: '14%', ...getCategoryData('tractionMetrics') },
    { key: 'businessMoat', label: 'Mô hình KD & Moat', weight: '12%', ...getCategoryData('businessMoat') },
    { key: 'tokenomics', label: 'Tokenomics', weight: '6%', ...getCategoryData('tokenomics') },
    { key: 'dealValuation', label: 'Deal & Định giá', weight: '4%', ...getCategoryData('dealValuation') },
  ];

  const formattedDate = created_at
    ? new Date(created_at).toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Circumference of score ring: 2 * PI * r = 2 * 3.14159 * 58 = 364.4
  const strokeDashoffset = 364.4 - (total_score / 100) * 364.4;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Header Overview Card */}
      <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-sm hover:border-border-strong hover:shadow-md transition-all duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-text-3 text-xs font-mono mb-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>Quét lúc: {formattedDate}</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-text mb-2">
              {name}
            </h1>
            
            <a
              href={website.startsWith('http') ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-brand hover:underline"
            >
              <span>{website}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            
            <p className="mt-4 text-text-2 text-sm sm:text-base max-w-2xl leading-relaxed font-sans">
              <span className="font-display font-bold text-text">Verdict:</span> {summary}
            </p>
          </div>

          {/* Large Radial Score Ring */}
          <div className="flex flex-col items-center justify-center self-center md:self-auto shrink-0">
            <div className="relative h-[132px] w-[132px] shrink-0">
              <svg className="-rotate-90" width="132" height="132" viewBox="0 0 132 132">
                <circle className="stroke-border-strong" cx="66" cy="66" r="58" fill="none" strokeWidth="9"/>
                <circle 
                  className={`fill-none ${style.stroke}`}
                  cx="66" 
                  cy="66" 
                  r="58" 
                  strokeWidth="9" 
                  strokeLinecap="round"
                  strokeDasharray="364.4" 
                  strokeDashoffset={strokeDashoffset}
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display font-extrabold text-3xl text-text leading-none">{total_score}</span>
                <span className="text-[9px] text-text-3 font-mono tracking-widest mt-1 uppercase">/ 100</span>
              </div>
            </div>
            
            <div className={`mt-3 rounded-full px-4 py-1 text-[10px] font-display font-bold tracking-wider uppercase border ${recStyle.bg} ${recStyle.text} ${recStyle.border}`}>
              {recStyle.label}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Scorecard Breakdown Table */}
      <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-lg font-display font-bold text-text mb-6 flex items-center gap-2">
          <Award className="h-5 w-5 text-copper" />
          <span>Scorecard — Due Diligence Chi Tiết</span>
        </h2>
        
        {/* Header row */}
        <div className="hidden sm:grid grid-cols-12 gap-4 mb-3 pb-2 text-[10px] font-mono font-semibold text-text-3 uppercase tracking-wider border-b border-border">
          <div className="col-span-4">Hạng mục</div>
          <div className="col-span-1 text-center">Trọng số</div>
          <div className="col-span-1 text-center">Điểm</div>
          <div className="col-span-1 text-center">Tin cậy</div>
          <div className="col-span-5">Reasoning</div>
        </div>

        <div className="space-y-4 sm:space-y-0 sm:divide-y sm:divide-border">
          {categories.map((cat, idx) => {
            const isNA = cat.score === null || cat.score === undefined;
            const scorePercent = isNA ? 0 : (cat.score! / cat.max) * 100;
            
            const catStyles = isNA 
              ? {
                  text: 'text-text-3',
                  bg: 'bg-surface-2',
                  border: 'border-border',
                  glow: '',
                  progress: 'bg-surface-hover',
                } 
              : getScoreStyles(scorePercent);

            const confBadge = isNA
              ? { text: 'text-text-3', bg: 'bg-surface-2', label: 'N/A' }
              : getConfidenceBadge(cat.confidence);

            return (
              <div key={cat.key} className={`sm:grid sm:grid-cols-12 sm:gap-4 sm:items-start sm:py-4 space-y-2 sm:space-y-0 ${isNA ? 'opacity-50' : ''}`}>
                {/* Category name & progress bar */}
                <div className="col-span-4 flex flex-col justify-center">
                  <span className={`font-display font-bold text-sm ${isNA ? 'text-text-3' : 'text-text'}`}>{cat.label}</span>
                  <div className="mt-2 h-1 w-full bg-surface-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${catStyles.progress} transition-all duration-1000`} 
                      style={{ width: `${isNA ? 0 : scorePercent}%` }}
                    />
                  </div>
                </div>
                
                {/* Weight */}
                <div className="col-span-1 text-left sm:text-center flex justify-between sm:block text-xs font-mono text-text-3">
                  <span className="sm:hidden">Trọng số:</span>
                  <span>{cat.weight}</span>
                </div>

                {/* Score with max */}
                <div className="col-span-1 text-left sm:text-center flex justify-between sm:block text-xs font-mono">
                  <span className="sm:hidden text-text-3">Điểm số:</span>
                  {isNA ? (
                    <span className="font-bold text-text-3">N/A</span>
                  ) : (
                    <span>
                      <span className={`font-bold ${catStyles.text}`}>{cat.score}</span>
                      <span className="text-text-3">/{cat.max}</span>
                    </span>
                  )}
                </div>

                {/* Confidence badge */}
                <div className="col-span-1 text-left sm:text-center flex justify-between sm:block">
                  <span className="sm:hidden text-xs text-text-3 font-mono">Tin cậy:</span>
                  <span className={`inline-block font-mono text-[9px] font-bold px-2 py-0.5 rounded tracking-wider ${confBadge.bg} ${confBadge.text}`}>
                    {confBadge.label}
                  </span>
                </div>

                {/* Reasoning */}
                <div className="col-span-5">
                  <p className={`text-xs sm:text-sm leading-relaxed font-sans ${isNA ? 'text-text-3' : 'text-text-2'}`}>
                    {cat.reasoning}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Strengths and Risks side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="bg-surface border border-pos-bd rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-display font-bold text-pos mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4.5 w-4.5" />
            <span>Điểm Mạnh &amp; Cơ Hội</span>
          </h2>
          {strengths && strengths.length > 0 ? (
            <ul className="space-y-3 font-sans">
              {strengths.map((str, i) => (
                <li key={i} className="flex gap-2.5 text-xs sm:text-sm text-text-2 leading-relaxed">
                  <span className="text-pos font-bold shrink-0 mt-0.5">▸</span>
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs sm:text-sm text-text-3 italic">Không tìm thấy điểm nổi bật đáng kể.</p>
          )}
        </div>

        {/* Risks */}
        <div className="bg-surface border border-neg-bd rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-display font-bold text-neg mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4.5 w-4.5" />
            <span>Rủi Ro &amp; Điểm Yếu</span>
          </h2>
          {risks && risks.length > 0 ? (
            <ul className="space-y-3 font-sans">
              {risks.map((risk, i) => (
                <li key={i} className="flex gap-2.5 text-xs sm:text-sm text-text-2 leading-relaxed">
                  <span className="text-neg font-bold shrink-0 mt-0.5">▸</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs sm:text-sm text-text-3 italic">Chưa xác định rủi ro hoặc thiếu thông tin cảnh báo.</p>
          )}
        </div>
      </div>

      {/* 4. Red Flags */}
      {red_flags && red_flags.length > 0 && (
        <div className="bg-surface border border-neg-bd bg-neg-soft/30 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-display font-bold text-neg mb-4 flex items-center gap-2">
            <ShieldAlert className="h-4.5 w-4.5" />
            <span>🚩 Red Flags</span>
          </h2>
          <ul className="space-y-3 font-sans">
            {red_flags.map((flag, i) => (
              <li key={i} className="flex gap-2.5 text-xs sm:text-sm text-text-2 leading-relaxed">
                <span className="text-neg font-bold shrink-0 mt-0.5">⚠</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Recommendation & Detailed Review */}
      <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-lg font-display font-bold text-text mb-4">Khuyến Nghị Đầu Tư &amp; Đánh Giá IC</h2>
        
        {/* Recommendation banner */}
        <div className={`mb-6 rounded-xl border p-4 flex gap-3 items-start ${recStyle.bg} ${recStyle.border}`}>
          <HelpCircle className={`h-5 w-5 ${recStyle.text} shrink-0 mt-0.5`} />
          <div className="font-sans">
            <h4 className={`text-xs font-display font-bold uppercase tracking-wider ${recStyle.text}`}>
              Kết luận
            </h4>
            <p className="text-text font-bold text-sm sm:text-base mt-1">
              {recommendation}
            </p>
          </div>
        </div>

        {/* Detailed Assessment Text */}
        <div className="space-y-2">
          <h4 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-text-3">
            Memo nội bộ — Đánh giá toàn diện:
          </h4>
          <p className="text-text-2 text-sm sm:text-base leading-[1.7] whitespace-pre-wrap font-sans">
            {detailed_assessment}
          </p>
        </div>
      </div>

      {/* 6. Questions for Founder */}
      {questions_for_founder && questions_for_founder.length > 0 && (
        <div className="bg-surface border border-brand-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-display font-bold text-brand mb-4 flex items-center gap-2">
            <MessageCircleQuestion className="h-4.5 w-4.5" />
            <span>Câu Hỏi Cần Hỏi Founder</span>
          </h2>
          <ul className="space-y-3 font-mono text-xs sm:text-sm">
            {questions_for_founder.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-text-2 leading-relaxed">
                <span className="text-brand font-bold shrink-0 mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-sans text-xs sm:text-sm">{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

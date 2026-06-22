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

  // Determine colors based on scores
  const getScoreStyles = (score: number) => {
    if (score >= 80) {
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        glow: 'glow-green',
        progress: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
      };
    } else if (score >= 60) {
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        glow: 'glow-yellow',
        progress: 'bg-gradient-to-r from-amber-600 to-amber-400',
      };
    } else {
      return {
        text: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        glow: 'glow-red',
        progress: 'bg-gradient-to-r from-rose-600 to-rose-400',
      };
    }
  };

  // Confidence badge colors
  const getConfidenceBadge = (confidence: string) => {
    const level = confidence?.toLowerCase() || '';
    if (level === 'cao' || level === 'high') {
      return { text: 'text-emerald-300', bg: 'bg-emerald-500/15', label: 'Cao' };
    } else if (level.includes('trung') || level === 'medium') {
      return { text: 'text-amber-300', bg: 'bg-amber-500/15', label: 'TB' };
    } else {
      return { text: 'text-rose-300', bg: 'bg-rose-500/15', label: 'Thấp' };
    }
  };

  // Recommendation badge
  const getRecommendationStyle = (rec: string) => {
    const upper = rec?.toUpperCase() || '';
    if (upper.includes('INVEST')) {
      return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'INVEST' };
    } else if (upper.includes('PASS')) {
      return { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', label: 'PASS' };
    } else {
      return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'NEED MORE INFO' };
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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Header Overview Card */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 relative overflow-hidden">
        {/* Decorative backdrop glow */}
        <div className={`absolute -right-16 -top-16 w-48 h-48 rounded-full blur-3xl opacity-20 ${style.bg}`} />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs sm:text-sm mb-1">
              <Calendar className="h-4 w-4" />
              <span>Due Diligence thực hiện lúc: {formattedDate}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
              {name}
            </h1>
            <a
              href={website.startsWith('http') ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <span>{website}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            
            <p className="mt-4 text-slate-300 text-base max-w-2xl leading-relaxed">
              <span className="font-semibold text-slate-100">Verdict:</span> {summary}
            </p>
          </div>

          {/* Large Radial Score */}
          <div className="flex flex-col items-center justify-center self-center md:self-auto shrink-0">
            <div className={`flex h-32 w-32 items-center justify-center rounded-full border-2 ${style.border} ${style.bg} ${style.glow} transition-all duration-500`}>
              <div className="text-center">
                <span className="block text-4xl font-black tracking-tight text-white">
                  {total_score}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  / 100
                </span>
              </div>
            </div>
            <div className={`mt-3 rounded-full px-3 py-1 text-xs font-bold ${recStyle.bg} ${recStyle.text} border ${recStyle.border}`}>
              {recStyle.label}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Scorecard Breakdown Table */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Award className="h-5 w-5 text-indigo-400" />
          <span>Scorecard — Due Diligence Chi Tiết</span>
        </h2>
        
        {/* Header row */}
        <div className="hidden sm:grid grid-cols-12 gap-2 mb-3 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <div className="col-span-4">Hạng mục</div>
          <div className="col-span-1 text-center">Trọng số</div>
          <div className="col-span-1 text-center">Điểm</div>
          <div className="col-span-1 text-center">Tin cậy</div>
          <div className="col-span-5">Reasoning</div>
        </div>

        <div className="space-y-4 sm:space-y-0 sm:divide-y sm:divide-white/5">
          {categories.map((cat) => {
            const isNA = cat.score === null || cat.score === undefined;
            const scorePercent = isNA ? 0 : (cat.score! / cat.max) * 100;
            
            const catStyles = isNA 
              ? {
                  text: 'text-slate-500',
                  bg: 'bg-slate-500/5',
                  border: 'border-slate-500/10',
                  glow: '',
                  progress: 'bg-slate-700',
                } 
              : getScoreStyles(scorePercent);

            const confBadge = isNA
              ? { text: 'text-slate-400', bg: 'bg-slate-800/80', label: 'N/A' }
              : getConfidenceBadge(cat.confidence);

            return (
              <div key={cat.key} className={`sm:grid sm:grid-cols-12 sm:gap-2 sm:items-start sm:py-4 space-y-2 sm:space-y-0 ${isNA ? 'opacity-60' : ''}`}>
                {/* Category name */}
                <div className="col-span-4 flex items-center gap-2">
                  <span className={`font-bold text-sm ${isNA ? 'text-slate-400' : 'text-slate-200'}`}>{cat.label}</span>
                </div>
                
                {/* Weight */}
                <div className="col-span-1 text-center">
                  <span className="text-xs text-slate-500 font-semibold">{cat.weight}</span>
                </div>

                {/* Score with progress */}
                <div className="col-span-1 text-center">
                  {isNA ? (
                    <span className="text-xs font-bold text-slate-500">N/A</span>
                  ) : (
                    <>
                      <span className={`text-sm font-bold ${catStyles.text}`}>{cat.score}</span>
                      <span className="text-slate-500 text-xs">/{cat.max}</span>
                    </>
                  )}
                </div>

                {/* Confidence badge */}
                <div className="col-span-1 text-center">
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${confBadge.bg} ${confBadge.text}`}>
                    {confBadge.label}
                  </span>
                </div>

                {/* Reasoning */}
                <div className="col-span-5">
                  <p className={`text-xs sm:text-sm leading-relaxed ${isNA ? 'text-slate-500' : 'text-slate-400'}`}>
                    {cat.reasoning}
                  </p>
                </div>

                {/* Mobile progress bar */}
                <div className="col-span-12 sm:hidden">
                  <div className="h-1.5 w-full rounded-full bg-slate-800/80 overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${catStyles.progress} transition-all duration-1000`} 
                      style={{ width: `${isNA ? 0 : scorePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Strengths and Risks side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="glass-card rounded-2xl p-6 border-emerald-500/10">
          <h2 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <span>Điểm Mạnh & Cơ Hội</span>
          </h2>
          {strengths && strengths.length > 0 ? (
            <ul className="space-y-3">
              {strengths.map((str, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                  <span className="text-emerald-500 font-bold shrink-0 mt-0.5">•</span>
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 italic">Không tìm thấy điểm nổi bật đáng kể.</p>
          )}
        </div>

        {/* Risks */}
        <div className="glass-card rounded-2xl p-6 border-rose-500/10">
          <h2 className="text-lg font-bold text-rose-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span>Rủi Ro & Điểm Yếu</span>
          </h2>
          {risks && risks.length > 0 ? (
            <ul className="space-y-3">
              {risks.map((risk, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                  <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 italic">Chưa xác định rủi ro hoặc thiếu thông tin cảnh báo.</p>
          )}
        </div>
      </div>

      {/* 4. Red Flags */}
      {red_flags && red_flags.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border-red-500/20 bg-red-500/[0.03]">
          <h2 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            <span>🚩 Red Flags</span>
          </h2>
          <ul className="space-y-3">
            {red_flags.map((flag, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                <span className="text-red-500 font-bold shrink-0 mt-0.5">⚠</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. Recommendation & Detailed Review */}
      <div className="glass-card rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-white mb-4">Khuyến Nghị Đầu Tư & Đánh Giá IC</h2>
        
        {/* Recommendation banner */}
        <div className={`mb-6 rounded-xl border p-4 flex gap-3 items-start ${recStyle.bg} ${recStyle.border}`}>
          <HelpCircle className={`h-6 w-6 ${recStyle.text} shrink-0 mt-0.5`} />
          <div>
            <h4 className={`text-base font-bold uppercase tracking-wide ${recStyle.text}`}>
              Kết luận
            </h4>
            <p className="text-slate-200 font-semibold text-sm sm:text-base mt-1">
              {recommendation}
            </p>
          </div>
        </div>

        {/* Detailed Assessment Text */}
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Memo nội bộ — Đánh giá toàn diện:
          </h4>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
            {detailed_assessment}
          </p>
        </div>
      </div>

      {/* 6. Questions for Founder */}
      {questions_for_founder && questions_for_founder.length > 0 && (
        <div className="glass-card rounded-2xl p-6 border-indigo-500/10">
          <h2 className="text-lg font-bold text-indigo-400 mb-4 flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5" />
            <span>Câu Hỏi Cần Hỏi Founder</span>
          </h2>
          <ul className="space-y-3">
            {questions_for_founder.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                <span className="text-indigo-400 font-bold shrink-0 mt-0.5">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

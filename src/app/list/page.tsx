'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProjectsAction, deleteProjectAction } from '@/app/actions';
import { Project } from '@/lib/db';
import { 
  Search, 
  Trash2, 
  ArrowUpDown, 
  Calendar, 
  ExternalLink, 
  Plus, 
  Database, 
  AlertCircle 
} from 'lucide-react';

export default function WatchlistPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'date_desc' | 'date_asc'>('date_desc');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch projects on load, search, and sort change
  const fetchProjects = async () => {
    setLoading(true);
    try {
      const actionSort = sortBy.startsWith('score') ? 'score' : 'date';
      const rawProjects = await getProjectsAction(search, actionSort);
      
      // Perform further direction-specific sorting on client side
      const sorted = [...rawProjects].sort((a, b) => {
        if (sortBy === 'score_desc') {
          return b.total_score - a.total_score;
        } else if (sortBy === 'score_asc') {
          return a.total_score - b.total_score;
        } else if (sortBy === 'date_asc') {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tA - tB;
        } else { // date_desc
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tB - tA;
        }
      });

      setProjects(sorted);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [search, sortBy]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent clicking row navigation
    
    if (confirm('Bạn có chắc chắn muốn xóa dự án này ra khỏi danh sách theo dõi?')) {
      setDeleteId(id);
      try {
        const success = await deleteProjectAction(id);
        if (success) {
          setProjects((prev) => prev.filter((p) => p.id !== id));
        } else {
          alert('Không thể xóa dự án. Vui lòng thử lại.');
        }
      } catch (error) {
        console.error(error);
        alert('Đã xảy ra lỗi khi xóa dự án.');
      } finally {
        setDeleteId(null);
      }
    }
  };

  const getScoreStyles = (score: number) => {
    if (score >= 80) return 'bg-pos-soft text-pos border-pos-bd';
    if (score >= 60) return 'bg-warn-soft text-warn border-warn-bd';
    return 'bg-neg-soft text-neg border-neg-bd';
  };

  const formatDate = (dateInput?: Date) => {
    if (!dateInput) return '-';
    return new Date(dateInput).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Dashboard title header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-[800] tracking-tight text-text flex items-center gap-2">
            <Database className="h-6 w-6 text-copper" />
            <span>Danh Sách Theo Dõi</span>
          </h1>
          <p className="text-text-3 text-xs sm:text-sm mt-1">
            Tổng hợp và so sánh điểm số các dự án crypto đã lưu trong database.
          </p>
        </div>
        <Link
          href="/research"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 px-4 py-2.5 text-xs font-display font-semibold text-[#052e2a] shadow transition duration-200 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Research Mới
        </Link>
      </div>

      {/* FILTER PANEL */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Search input field */}
        <div className="sm:col-span-2 relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-text-3" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text placeholder-text-3 focus:border-brand focus:bg-surface-2 focus:ring-0 focus:outline-none transition-all"
            placeholder="Tìm kiếm dự án theo tên hoặc website..."
          />
        </div>

        {/* Sort Select list */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <ArrowUpDown className="h-4 w-4 text-text-3" />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="block w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-8 text-sm text-text font-mono focus:border-brand focus:ring-0 focus:outline-none transition-all appearance-none cursor-pointer"
          >
            <option value="date_desc">Ngày phân tích: Mới nhất</option>
            <option value="date_asc">Ngày phân tích: Cũ nhất</option>
            <option value="score_desc">Điểm số: Từ cao đến thấp</option>
            <option value="score_asc">Điểm số: Từ thấp đến cao</option>
          </select>
          {/* Custom chevron dropdown arrow */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg className="h-4 w-4 text-text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* WATCHLIST LIST VIEW CARD */}
      <div className="space-y-3">
        {loading && projects.length === 0 ? (
          <div className="py-24 text-center bg-surface border border-border rounded-2xl">
            <div className="h-8 w-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-3 text-xs sm:text-sm font-mono">Đang tải danh sách dự án...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="py-20 text-center px-4 bg-surface border border-border rounded-2xl">
            <div className="h-12 w-12 rounded-xl bg-surface-2 border border-border text-text-3 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-display font-bold text-text mb-1">Chưa có dự án nào</h3>
            <p className="text-text-3 text-xs sm:text-sm max-w-sm mx-auto mb-6">
              {search.trim() 
                ? 'Không tìm thấy kết quả phù hợp với từ khóa tìm kiếm của bạn.' 
                : 'Bắt đầu chấm điểm dự án đầu tiên của bạn để thêm vào danh sách theo dõi.'}
            </p>
            {!search.trim() && (
              <Link
                href="/research"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 px-5 py-2.5 text-xs font-display font-semibold text-[#052e2a] shadow transition duration-200"
              >
                Tạo phân tích đầu tiên
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((proj, idx) => {
              const scoreColorClass = getScoreStyles(proj.total_score);
              
              // Resolve name: if generic "Dự án", extract and capitalize domain name
              const resolvedName = proj.name === 'Dự án'
                ? (() => {
                    const domain = proj.website.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
                    const part = domain.split('.')[0];
                    return part ? part.charAt(0).toUpperCase() + part.slice(1) : domain;
                  })()
                : proj.name;

              return (
                <div
                  key={proj.id}
                  onClick={() => router.push(`/project/${proj.id}`)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface border border-border hover:border-border-strong hover:bg-surface-hover transition duration-150 cursor-pointer shadow-sm"
                >
                  {/* Project & Website Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Rank index number column */}
                    <div className="font-mono text-sm sm:text-base font-bold text-text-3/40 w-6 text-center select-none shrink-0">
                      {(idx + 1).toString().padStart(2, '0')}
                    </div>

                    {/* Score box - 44px rounded square (11px radius) */}
                    <div className={`h-11 w-11 rounded-[11px] border flex items-center justify-center font-display font-extrabold text-base shrink-0 ${scoreColorClass}`}>
                      {proj.total_score}
                    </div>
                    
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-sm sm:text-base text-text leading-none transition-colors truncate">
                        {resolvedName}
                      </h4>
                      <a
                        href={proj.website.startsWith('http') ? proj.website : `https://${proj.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()} // Stop row navigating
                        className="font-mono text-[10px] text-text-3 mt-1.5 inline-flex items-center gap-1 hover:text-brand transition-colors"
                      >
                        <span className="truncate max-w-[150px] sm:max-w-[250px]">{proj.website}</span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    </div>
                  </div>

                  {/* Recommendation details */}
                  <div className="flex-1 sm:px-6 font-mono text-xs uppercase tracking-wider text-text-2">
                    {proj.recommendation}
                  </div>

                  {/* Created Date & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 border-t border-border sm:border-0 pt-3 sm:pt-0">
                    <div className="flex items-center gap-1.5 justify-center font-mono text-xs text-text-3">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(proj.created_at)}</span>
                    </div>

                    <button
                      onClick={(e) => handleDelete(e, proj.id)}
                      disabled={deleteId === proj.id}
                      className="rounded-lg p-2 text-text-3 hover:bg-neg-soft hover:text-neg transition duration-150 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

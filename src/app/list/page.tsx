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
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (score >= 60) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
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
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Database className="h-7 w-7 text-indigo-400" />
            <span>Danh Sách Theo Dõi</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Tổng hợp và so sánh điểm số các dự án crypto đã lưu trong database.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-600/10 hover:bg-indigo-500 hover:shadow-indigo-500/20 active:scale-[0.98] transition-all self-start sm:self-auto"
        >
          <Plus className="h-4.5 w-4.5" />
          Research Mới
        </Link>
      </div>

      {/* FILTER PANEL */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Search input field */}
        <div className="sm:col-span-2 relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4.5 w-4.5 text-slate-500" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all"
            placeholder="Tìm kiếm dự án theo tên hoặc website..."
          />
        </div>

        {/* Sort Select list */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <ArrowUpDown className="h-4 w-4 text-slate-500" />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="block w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-9 pr-8 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all appearance-none cursor-pointer"
          >
            <option value="date_desc">Ngày phân tích: Mới nhất</option>
            <option value="date_asc">Ngày phân tích: Cũ nhất</option>
            <option value="score_desc">Điểm số: Từ cao đến thấp</option>
            <option value="score_asc">Điểm số: Từ thấp đến cao</option>
          </select>
          {/* Custom chevron dropdown arrow */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* WATCHLIST TABLE VIEW CARD */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading && projects.length === 0 ? (
          <div className="py-24 text-center">
            <div className="h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Đang tải danh sách dự án...</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="py-20 text-center px-4">
            <div className="h-12 w-12 rounded-xl bg-slate-800/50 border border-white/5 text-slate-500 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Chưa có dự án nào</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
              {search.trim() 
                ? 'Không tìm thấy kết quả phù hợp với từ khóa tìm kiếm của bạn.' 
                : 'Bắt đầu chấm điểm dự án đầu tiên của bạn để thêm vào danh sách theo dõi.'}
            </p>
            {!search.trim() && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition-all"
              >
                Tạo phân tích đầu tiên
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-slate-900/30 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-4 px-6">Dự án</th>
                  <th className="py-4 px-6 text-center">Điểm tổng</th>
                  <th className="py-4 px-6">Khuyến nghị</th>
                  <th className="py-4 px-6 text-center">Ngày research</th>
                  <th className="py-4 px-6 text-right">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {projects.map((proj) => (
                  <tr
                    key={proj.id}
                    onClick={() => router.push(`/project/${proj.id}`)}
                    className="hover:bg-indigo-600/[0.02] cursor-pointer active:bg-indigo-600/[0.04] transition-all duration-150"
                  >
                    {/* Project & Website Info */}
                    <td className="py-4 px-6 max-w-xs">
                      <div className="font-bold text-slate-200 text-sm sm:text-base mb-0.5 truncate hover:text-white transition-colors">
                        {proj.name}
                      </div>
                      <a
                        href={proj.website.startsWith('http') ? proj.website : `https://${proj.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()} // Stop row navigating
                        className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <span className="truncate max-w-[150px]">{proj.website}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>

                    {/* Total Score Badge */}
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-sm font-bold w-12 ${getScoreStyles(proj.total_score)}`}>
                        {proj.total_score}
                      </span>
                    </td>

                    {/* Recommendation details */}
                    <td className="py-4 px-6 text-sm text-slate-300 max-w-xs sm:max-w-md">
                      <div className="truncate font-medium text-xs sm:text-sm">
                        {proj.recommendation}
                      </div>
                    </td>

                    {/* Created Date */}
                    <td className="py-4 px-6 text-center text-xs sm:text-sm text-slate-400 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 justify-center">
                        <Calendar className="h-3.5 w-3.5 text-slate-500" />
                        <span>{formatDate(proj.created_at)}</span>
                      </div>
                    </td>

                    {/* Delete action trigger */}
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={(e) => handleDelete(e, proj.id)}
                        disabled={deleteId === proj.id}
                        className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 active:scale-95 disabled:opacity-50 transition-all focus:outline-none"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

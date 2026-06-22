import Link from 'next/link';
import { getProjectById } from '@/lib/db';
import ProjectResult from '@/app/components/ProjectResult';
import { ChevronLeft, AlertCircle, Database } from 'lucide-react';

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  // Await dynamic route parameters
  const { id } = await params;
  
  // Fetch from PostgreSQL (or local JSON fallback) directly inside RSC
  const project = await getProjectById(id);

  if (!project) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center">
        <div className="h-14 w-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-6 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Báo Cáo Không Tồn Tại</h2>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Không tìm thấy dự án crypto tương ứng với mã định danh này. Có thể dự án đã bị xóa hoặc URL truy cập không đúng.
        </p>
        <Link
          href="/list"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-500 active:scale-[0.98] transition-all"
        >
          Quay lại Danh sách theo dõi
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button header navigation bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/list"
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5 transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lại Danh sách theo dõi
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-900/40 border border-white/5 rounded-full px-3 py-1">
          <Database className="h-3 w-3 text-indigo-400" />
          <span>UUID: {project.id}</span>
        </div>
      </div>

      {/* Main Scoring Dashboard */}
      <ProjectResult project={project} />
    </div>
  );
}

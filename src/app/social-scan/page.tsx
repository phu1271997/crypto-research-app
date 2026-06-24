import { getAllProjects, getLatestScanReportForEachProject } from '@/lib/db';
import SocialScanClient from '@/app/components/SocialScanClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scan — Primus Research AI',
  description: 'Quét và giám sát xung lực, xu hướng hoạt động mạng xã hội của các dự án tiền điện tử.',
};

export default async function SocialScanPage() {
  // Fetch data server-side
  const projects = await getAllProjects('', 'date');
  const latestReports = await getLatestScanReportForEachProject();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <SocialScanClient initialProjects={projects} initialLatestReports={latestReports} />
    </div>
  );
}

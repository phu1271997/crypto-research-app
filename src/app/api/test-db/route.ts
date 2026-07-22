import { NextResponse } from 'next/server';
import { getAllProjects, getBotStatus } from '@/lib/db';

export async function GET() {
  try {
    const projects = await getAllProjects();
    const botStatus = await getBotStatus();
    return NextResponse.json({
      success: true,
      db_url_configured: !!process.env.DATABASE_URL,
      projects_count: projects.length,
      projects_sample: projects.slice(0, 3).map(p => ({ id: p.id, name: p.name })),
      bot_status: botStatus,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}

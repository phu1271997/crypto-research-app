import { NextResponse } from 'next/server';
import { getBotStatus } from '@/lib/db';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  const maskedDbUrl = dbUrl 
    ? `${dbUrl.split('@')[0].substring(0, 15)}...@${dbUrl.split('@')[1] || ''}` 
    : 'NOT_SET';

  let dbStatus = 'unknown';
  let dbError = null;
  let botStatusData = null;

  try {
    botStatusData = await getBotStatus();
    dbStatus = 'connected';
  } catch (err: any) {
    dbStatus = 'error';
    dbError = err.message || err.toString();
  }

  return NextResponse.json({
    database_url_configured: !!dbUrl,
    database_url_masked: maskedDbUrl,
    connection_status: dbStatus,
    error: dbError,
    bot_status: botStatusData,
  });
}

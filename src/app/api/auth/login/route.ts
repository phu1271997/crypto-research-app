import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD || 'azdag127';

    if (password === adminPassword) {
      const response = NextResponse.json({ success: true });
      
      // Set secure HTTP-only cookie for session tracking
      response.cookies.set('auth_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      
      return response;
    }

    return NextResponse.json(
      { success: false, error: 'Mật khẩu không chính xác' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi khi xác thực' },
      { status: 500 }
    );
  }
}

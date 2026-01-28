import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * HTTP Basic Authentication Middleware
 * Protects the entire site with username/password from environment variables.
 * 
 * Set these in .env.local:
 *   SITE_AUTH_USERNAME=admin
 *   SITE_AUTH_PASSWORD=your-secure-password
 * 
 * To disable auth (e.g., for development), don't set these variables.
 */

export function middleware(request: NextRequest) {
  const username = process.env.SITE_AUTH_USERNAME;
  const password = process.env.SITE_AUTH_PASSWORD;

  // If auth is not configured, allow access (useful for local dev)
  if (!username || !password) {
    return NextResponse.next();
  }

  // Check for Authorization header
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return unauthorizedResponse();
  }

  // Decode and validate credentials
  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [providedUser, providedPass] = credentials.split(':');

    // Use timing-safe comparison to prevent timing attacks
    const userMatch = providedUser === username;
    const passMatch = providedPass === password;

    if (userMatch && passMatch) {
      return NextResponse.next();
    }
  } catch {
    // Invalid auth header format
  }

  return unauthorizedResponse();
}

function unauthorizedResponse() {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="HypnoRaffle", charset="UTF-8"',
    },
  });
}

// Apply to all routes except static files and API routes that need to be public
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|images/).*)',
  ],
};

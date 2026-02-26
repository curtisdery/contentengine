export const TEST_USER = {
  email: 'test@pandocast.com',
  password: 'TestPassword123!',
  fullName: 'Test User',
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  DASHBOARD: '/dashboard',
  CONTENT: '/content',
  CONTENT_UPLOAD: '/content/upload',
  VOICE: '/voice',
  VOICE_PROFILES: '/voice/profiles',
  VOICE_SETUP: '/voice/setup',
  CALENDAR: '/calendar',
  CALENDAR_QUEUE: '/calendar/queue',
  ANALYTICS: '/analytics',
  SETTINGS: '/settings',
  SETTINGS_CONNECTIONS: '/settings/connections',
  SETTINGS_AUTOPILOT: '/settings/autopilot',
  SETTINGS_SECURITY: '/settings/security',
  BLOG: '/blog',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  OAUTH_CALLBACK: '/oauth/callback',
} as const;

export const PROTECTED_ROUTES = [
  ROUTES.DASHBOARD,
  ROUTES.CONTENT,
  ROUTES.CONTENT_UPLOAD,
  ROUTES.VOICE_PROFILES,
  ROUTES.VOICE_SETUP,
  ROUTES.CALENDAR,
  ROUTES.CALENDAR_QUEUE,
  ROUTES.ANALYTICS,
  ROUTES.SETTINGS,
  ROUTES.SETTINGS_CONNECTIONS,
  ROUTES.SETTINGS_AUTOPILOT,
  ROUTES.SETTINGS_SECURITY,
] as const;

export const PUBLIC_ROUTES = [
  ROUTES.HOME,
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.BLOG,
  ROUTES.PRIVACY,
  ROUTES.TERMS,
] as const;

export const TEST_USER = {
  email: 'test@pandocast.com',
  password: 'TestPassword123!',
  fullName: 'Test User',
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  DASHBOARD: '/dashboard',
  CONTENT: '/content',
  CONTENT_UPLOAD: '/content/upload',
  VOICE_PROFILES: '/voice/profiles',
  CALENDAR: '/calendar',
  ANALYTICS: '/analytics',
  SETTINGS: '/settings',
  SETTINGS_CONNECTIONS: '/settings/connections',
  SETTINGS_AUTOPILOT: '/settings/autopilot',
  SETTINGS_SECURITY: '/settings/security',
} as const;

export const PROTECTED_ROUTES = [
  ROUTES.DASHBOARD,
  ROUTES.CONTENT,
  ROUTES.CONTENT_UPLOAD,
  ROUTES.CALENDAR,
  ROUTES.ANALYTICS,
  ROUTES.SETTINGS,
  ROUTES.SETTINGS_CONNECTIONS,
] as const;

export const PUBLIC_ROUTES = [
  ROUTES.HOME,
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
] as const;

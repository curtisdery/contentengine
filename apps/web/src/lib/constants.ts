export const APP_NAME = 'Pandocast';
export const APP_TAGLINE = 'Upload once. Pando everywhere.';
export const APP_DESCRIPTION = 'Pandocast — Upload once. Pando everywhere.';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  DASHBOARD: '/dashboard',
  SETTINGS: '/settings',
  CONTENT: '/content',
  CONTENT_UPLOAD: '/content/upload',
  CONTENT_DETAIL: '/content',  // + /${id}
  VOICE_SETUP: '/voice/setup',
  VOICE_PROFILES: '/voice/profiles',
  CALENDAR: '/calendar',
  CALENDAR_QUEUE: '/calendar/queue',
  ANALYTICS: '/analytics',
  GENERATION: '/content',       // generation is accessed via /content/[id]/outputs
  OUTPUTS: '/outputs',          // used as sub-route
  SETTINGS_CONNECTIONS: '/settings/connections',
  SETTINGS_AUTOPILOT: '/settings/autopilot',
  SETTINGS_SECURITY: '/settings/security',
  OAUTH_CALLBACK: '/oauth/callback',
} as const;

export const TOAST_DURATION = 5000;

export const SUBSCRIPTION_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
};

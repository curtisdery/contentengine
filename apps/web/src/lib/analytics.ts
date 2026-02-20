import { getFirebaseAnalytics } from './firebase';

export async function trackEvent(
  eventName: string,
  eventParams?: Record<string, string | number | boolean>
) {
  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;
  const { logEvent } = await import('firebase/analytics');
  logEvent(analytics, eventName, eventParams);
}

export async function setAnalyticsUserId(userId: string | null) {
  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;
  const { setUserId } = await import('firebase/analytics');
  setUserId(analytics, userId);
}

export async function setAnalyticsUserProperties(
  properties: Record<string, string>
) {
  const analytics = await getFirebaseAnalytics();
  if (!analytics) return;
  const { setUserProperties } = await import('firebase/analytics');
  setUserProperties(analytics, properties);
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  firebase_uid: string | null;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  subscription_tier: SubscriptionTier;
}

export const MOCK_USER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@pandocast.com',
  full_name: 'Test User',
  avatar_url: null,
  subscription_tier: 'growth',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

export const MOCK_CONTENT_LIST = {
  items: [
    {
      id: '660e8400-e29b-41d4-a716-446655440001',
      title: 'How to Build a SaaS',
      content_type: 'blog',
      status: 'completed',
      created_at: '2025-06-01T10:00:00Z',
      platform_count: 18,
    },
    {
      id: '660e8400-e29b-41d4-a716-446655440002',
      title: 'Podcast Episode 42',
      content_type: 'podcast',
      status: 'processing',
      created_at: '2025-06-02T14:30:00Z',
      platform_count: 12,
    },
  ],
  total: 2,
  page: 1,
  per_page: 20,
};

export const MOCK_EMPTY_CONTENT_LIST = {
  items: [],
  total: 0,
  page: 1,
  per_page: 20,
};

export const MOCK_AUTOPILOT_SUMMARY = {
  enabled: false,
  rules_count: 0,
  next_scheduled: null,
};

export const MOCK_ANALYTICS_SUMMARY = {
  total_views: 12400,
  total_engagements: 3200,
  multiplier_score: 8.4,
  platforms_active: 6,
};

export const MOCK_SIGNUP_RESPONSE = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  full_name: MOCK_USER.full_name,
  message: 'Account created successfully',
};

export const MOCK_LOGOUT_RESPONSE = {
  message: 'Logged out successfully',
};

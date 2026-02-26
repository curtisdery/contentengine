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

export const MOCK_FREE_USER = {
  ...MOCK_USER,
  id: 'e2e-free-user',
  subscription_tier: 'free' as const,
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
  autopilot_enabled: 0,
  eligible_not_enabled: 0,
  total_auto_published: 0,
  platforms: [],
};

export const MOCK_ANALYTICS_SUMMARY = {
  total_content_pieces: 2,
  total_outputs_generated: 30,
  total_published: 12,
  total_reach: 12400,
  total_engagements: 3200,
  avg_multiplier_score: 4.2,
  best_multiplier_score: 8.4,
  platforms_active: 3,
  top_performing_content: [],
  recent_performance: [],
};

export const MOCK_CONNECTIONS = [
  {
    id: 'conn-001',
    workspace_id: '550e8400-e29b-41d4-a716-446655440000',
    platform_id: 'twitter',
    platform_username: '@testuser',
    is_active: true,
    created_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'conn-002',
    workspace_id: '550e8400-e29b-41d4-a716-446655440000',
    platform_id: 'linkedin',
    platform_username: 'Test User',
    is_active: true,
    created_at: '2025-02-01T00:00:00Z',
  },
  {
    id: 'conn-003',
    workspace_id: '550e8400-e29b-41d4-a716-446655440000',
    platform_id: 'bluesky',
    platform_username: '@testuser.bsky.social',
    is_active: false,
    created_at: '2025-02-10T00:00:00Z',
  },
];

export const MOCK_ANALYTICS_EMPTY = {
  total_content_pieces: 0,
  total_outputs_generated: 0,
  total_published: 0,
  total_reach: 0,
  total_engagements: 0,
  avg_multiplier_score: 0,
  best_multiplier_score: 0,
  platforms_active: 0,
  top_performing_content: [],
  recent_performance: [],
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

export const MOCK_SESSIONS = {
  sessions: [
    {
      id: 'session-001',
      device: 'Chrome on macOS',
      ip_address: '192.168.1.1',
      last_active: '2025-06-01T12:00:00Z',
      created_at: '2025-05-01T08:00:00Z',
      is_current: true,
    },
    {
      id: 'session-002',
      device: 'Safari on iPhone',
      ip_address: '10.0.0.1',
      last_active: '2025-05-28T18:30:00Z',
      created_at: '2025-05-15T09:00:00Z',
      is_current: false,
    },
  ],
};

export const MOCK_AUDIT_LOG = {
  entries: [
    {
      id: 'audit-001',
      action: 'login',
      details: 'Signed in via email',
      ip_address: '192.168.1.1',
      timestamp: '2025-06-01T12:00:00Z',
    },
    {
      id: 'audit-002',
      action: 'content_upload',
      details: 'Uploaded "How to Build a SaaS"',
      ip_address: '192.168.1.1',
      timestamp: '2025-06-01T10:00:00Z',
    },
  ],
  total: 2,
};

export const MOCK_VOICE_PROFILES = {
  items: [
    {
      id: 'voice-001',
      workspace_id: '550e8400-e29b-41d4-a716-446655440000',
      profile_name: 'Professional Voice',
      is_default: true,
      sample_content: [],
      vocabulary: {},
      formatting_config: {},
      cta_library: [],
      topic_boundaries: {},
      voice_attributes: ['Confident', 'Clear', 'Warm'],
      tone_metrics: { formality: 3, humor: 2, enthusiasm: 4 },
      created_at: '2025-03-01T00:00:00Z',
      updated_at: '2025-03-01T00:00:00Z',
    },
  ],
  total: 1,
};

export const MOCK_OUTPUTS = {
  items: [
    {
      id: 'output-001',
      content_id: '660e8400-e29b-41d4-a716-446655440001',
      platform: 'twitter',
      format: 'TWITTER_SINGLE',
      content: 'Building a SaaS is about solving real problems, not chasing trends.',
      status: 'draft',
      tier: 'amplifier',
      created_at: '2025-06-01T11:00:00Z',
    },
    {
      id: 'output-002',
      content_id: '660e8400-e29b-41d4-a716-446655440001',
      platform: 'linkedin',
      format: 'LINKEDIN_POST',
      content: 'I spent 3 years building a SaaS from scratch. Here are the lessons...',
      status: 'approved',
      tier: 'amplifier',
      created_at: '2025-06-01T11:00:00Z',
    },
    {
      id: 'output-003',
      content_id: '660e8400-e29b-41d4-a716-446655440001',
      platform: 'instagram',
      format: 'INSTAGRAM_CAROUSEL',
      content: 'Slide 1: How to Build a SaaS\nSlide 2: Start with a real problem...',
      status: 'draft',
      tier: 'discovery',
      created_at: '2025-06-01T11:00:00Z',
    },
  ],
  total: 3,
};

export const MOCK_CALENDAR_EVENTS = {
  events: [
    {
      id: 'event-001',
      output_id: 'output-001',
      platform: 'twitter',
      title: 'Building a SaaS is about solving real problems...',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      status: 'scheduled',
    },
    {
      id: 'event-002',
      output_id: 'output-002',
      platform: 'linkedin',
      title: 'I spent 3 years building a SaaS from scratch...',
      scheduled_at: new Date(Date.now() + 172800000).toISOString(), // day after
      status: 'scheduled',
    },
  ],
  total: 2,
};

export const MOCK_NOTIFICATIONS = {
  items: [],
  total: 0,
  unread_count: 0,
};

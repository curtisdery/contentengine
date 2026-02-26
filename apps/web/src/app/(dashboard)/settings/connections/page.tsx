'use client';

import * as React from 'react';
import {
  Globe,
  Check,
  Unplug,
  Loader2,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  X,
  KeyRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { getPlatformConfig, platformMap } from '@/components/content/platform-badge';
import { callFunction, ApiClientError } from '@/lib/cloud-functions';
import { useToast } from '@/hooks/use-toast';
import { useOAuthPopup } from '@/hooks/use-oauth-popup';
import { ROUTES } from '@/lib/constants';
import { PageTitle } from '@/components/layout/page-title';
import type {
  PlatformConnectionResponse,
  PlatformProfileResponse,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Platform auth method classification
// ---------------------------------------------------------------------------

const MANUAL_ONLY_PLATFORMS = ['substack', 'quora', 'email', 'press', 'slides'];
const APP_PASSWORD_PLATFORMS = ['bluesky'];

type AuthMethod = 'oauth' | 'app_password' | 'manual';

function getAuthMethod(platformId: string): AuthMethod {
  if (MANUAL_ONLY_PLATFORMS.includes(platformId)) return 'manual';
  if (APP_PASSWORD_PLATFORMS.includes(platformId)) return 'app_password';
  return 'oauth';
}

// ---------------------------------------------------------------------------
// All platforms grouped by tier
// ---------------------------------------------------------------------------

interface PlatformDef {
  id: string;
  name: string;
  tier: number;
}

const ALL_PLATFORMS: PlatformDef[] = [
  // Tier 1 - Micro-content
  { id: 'twitter', name: 'Twitter / X', tier: 1 },
  { id: 'threads', name: 'Threads', tier: 1 },
  { id: 'bluesky', name: 'Bluesky', tier: 1 },
  // Tier 2 - Professional
  { id: 'linkedin', name: 'LinkedIn', tier: 2 },
  { id: 'facebook', name: 'Facebook', tier: 2 },
  // Tier 3 - Visual
  { id: 'instagram', name: 'Instagram', tier: 3 },
  { id: 'pinterest', name: 'Pinterest', tier: 3 },
  { id: 'tiktok', name: 'TikTok', tier: 3 },
  { id: 'youtube', name: 'YouTube', tier: 3 },
  // Tier 4 - Long-form
  { id: 'medium', name: 'Medium', tier: 4 },
  { id: 'substack', name: 'Substack', tier: 4 },
  { id: 'email', name: 'Email Newsletter', tier: 4 },
  // Tier 5 - Community
  { id: 'reddit', name: 'Reddit', tier: 5 },
  { id: 'quora', name: 'Quora', tier: 5 },
  // Tier 6 - Professional assets
  { id: 'slides', name: 'Slide Deck', tier: 6 },
  { id: 'press', name: 'Press Release', tier: 6 },
];

const TIER_LABELS: Record<number, string> = {
  1: 'Micro-Content',
  2: 'Professional Networks',
  3: 'Visual Platforms',
  4: 'Long-Form & Newsletters',
  5: 'Community & Q&A',
  6: 'Professional Assets',
};

// ---------------------------------------------------------------------------
// Platform Card Component
// ---------------------------------------------------------------------------

interface PlatformCardProps {
  platform: PlatformDef;
  connection: PlatformConnectionResponse | null;
  onConnect: (platformId: string) => void;
  onDisconnect: (connectionId: string) => void;
  isActioning: boolean;
}

function PlatformCard({
  platform,
  connection,
  onConnect,
  onDisconnect,
  isActioning,
}: PlatformCardProps) {
  const config = getPlatformConfig(platform.id);
  const isConnected = connection !== null && connection.is_active;
  const authMethod = getAuthMethod(platform.id);

  const connectLabel = (() => {
    if (authMethod === 'manual') return 'Manual Only';
    if (authMethod === 'app_password') return 'Connect with App Password';
    return 'Connect';
  })();

  const ConnectIcon = authMethod === 'app_password' ? KeyRound : ExternalLink;

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all duration-300',
        'bg-cme-surface/60 backdrop-blur-sm',
        isConnected
          ? 'border-cme-success/30 hover:border-cme-success/50'
          : 'border-cme-border hover:border-cme-border-bright',
        'hover:bg-cme-surface-hover/40'
      )}
    >
      {/* Connected indicator */}
      {isConnected && (
        <div className="absolute -top-1.5 -right-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cme-success shadow-[0_0_8px_rgba(0,200,150,0.3)]">
            <Check className="h-3 w-3 text-white" />
          </div>
        </div>
      )}

      {/* Manual badge */}
      {authMethod === 'manual' && !isConnected && (
        <div className="absolute -top-1.5 -right-1.5">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-cme-surface border-cme-border">
            Manual
          </Badge>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Platform icon */}
        <div
          className="shrink-0 rounded-lg p-2.5 transition-all duration-300 group-hover:scale-105"
          style={{ backgroundColor: `${config.color}15` }}
        >
          <span
            className="flex h-5 w-5 items-center justify-center"
            style={{ color: config.color }}
          >
            {config.icon ?? (
              <span className="text-xs font-bold">
                {config.name.charAt(0)}
              </span>
            )}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-cme-text">{config.name}</p>

          {isConnected && connection ? (
            <p className="text-xs text-cme-success mt-0.5 truncate">
              @{connection.platform_username}
            </p>
          ) : (
            <p className="text-xs text-cme-text-muted mt-0.5">Not connected</p>
          )}
        </div>
      </div>

      <div className="mt-3">
        {isConnected && connection ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDisconnect(connection.id)}
            disabled={isActioning}
            className="w-full gap-1.5 text-xs h-8 text-cme-text-muted hover:text-cme-error hover:border-cme-error/50"
          >
            {isActioning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unplug className="h-3 w-3" />
            )}
            Disconnect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConnect(platform.id)}
            disabled={isActioning || authMethod === 'manual'}
            className={cn(
              'w-full gap-1.5 text-xs h-8',
              authMethod === 'manual' && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isActioning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ConnectIcon className="h-3 w-3" />
            )}
            {connectLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bluesky App Password Dialog (overlay)
// ---------------------------------------------------------------------------

interface BlueskyDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function BlueskyDialog({ open, onClose, onSuccess }: BlueskyDialogProps) {
  const { success: showSuccess, error: showError } = useToast();
  const [handle, setHandle] = React.useState('');
  const [appPassword, setAppPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || !appPassword.trim()) return;

    setIsSubmitting(true);
    try {
      await callFunction('refreshConnection', {
        handle: handle.trim(),
        app_password: appPassword.trim(),
      });
      showSuccess('Connected', 'Bluesky has been connected successfully.');
      setHandle('');
      setAppPassword('');
      onClose();
      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Connection failed', err.detail);
      } else {
        showError('Connection failed', 'An unexpected error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-cme-border bg-cme-background p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-cme-text">Connect Bluesky</h3>
          <button onClick={onClose} className="text-cme-text-muted hover:text-cme-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-cme-text-muted mb-4">
          Bluesky uses app passwords for third-party access. Create one at{' '}
          <a
            href="https://bsky.app/settings/app-passwords"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cme-primary hover:underline"
          >
            bsky.app/settings/app-passwords
          </a>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Handle"
            placeholder="you.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            disabled={isSubmitting}
          />
          <Input
            label="App Password"
            type="password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            disabled={isSubmitting}
          />
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !handle.trim() || !appPassword.trim()}
              className="flex-1"
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : null}
              Connect
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Connections Page
// ---------------------------------------------------------------------------

export default function ConnectionsPage() {
  const router = useRouter();
  const { success: showSuccess, error: showError, warning: showWarning } = useToast();
  const { startOAuth, isConnecting } = useOAuthPopup();

  const [connections, setConnections] = React.useState<PlatformConnectionResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [actioningPlatform, setActioningPlatform] = React.useState<string | null>(null);
  const [blueskyDialogOpen, setBlueskyDialogOpen] = React.useState(false);

  // Fetch connections
  const fetchConnections = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await callFunction<Record<string, unknown>, { items: PlatformConnectionResponse[]; total: number }>('listConnections', {});
      setConnections(response.items);
    } catch {
      // Silently handle - connections might not be set up yet
      setConnections([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Get connection for a platform
  const getConnection = (platformId: string): PlatformConnectionResponse | null => {
    return connections.find((c) => c.platform_id === platformId && c.is_active) || null;
  };

  const connectedCount = connections.filter((c) => c.is_active).length;

  // Connect handler
  const handleConnect = async (platformId: string) => {
    const authMethod = getAuthMethod(platformId);

    if (authMethod === 'manual') return;

    if (authMethod === 'app_password') {
      setBlueskyDialogOpen(true);
      return;
    }

    // OAuth flow
    setActioningPlatform(platformId);
    try {
      const result = await startOAuth(platformId);
      if (result.status === 'success') {
        showSuccess('Connected', `${getPlatformConfig(platformId).name} has been connected.`);
        await fetchConnections();
      } else {
        showError('Connection failed', result.error || 'OAuth flow did not complete successfully.');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Connection failed', err.detail);
      } else if (err instanceof Error) {
        showError('Connection failed', err.message);
      } else {
        showError('Connection failed', 'An unexpected error occurred.');
      }
    } finally {
      setActioningPlatform(null);
    }
  };

  // Disconnect handler
  const handleDisconnect = async (connectionId: string) => {
    const conn = connections.find((c) => c.id === connectionId);
    if (!conn) return;

    setActioningPlatform(conn.platform_id);
    try {
      await callFunction('disconnectPlatform', { connection_id: connectionId });
      showSuccess('Disconnected', `${getPlatformConfig(conn.platform_id).name} has been disconnected.`);
      await fetchConnections();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Disconnect failed', err.detail);
      } else {
        showError('Disconnect failed', 'An unexpected error occurred.');
      }
    } finally {
      setActioningPlatform(null);
    }
  };

  // Group platforms by tier
  const tiers = React.useMemo(() => {
    const grouped: Record<number, PlatformDef[]> = {};
    ALL_PLATFORMS.forEach((p) => {
      if (!grouped[p.tier]) grouped[p.tier] = [];
      grouped[p.tier].push(p);
    });
    return grouped;
  }, []);

  return (
    <div className="max-w-4xl space-y-8 animate-fade-in">
      <PageTitle title="Connections" />
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(ROUTES.SETTINGS)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-cme-text">
            Connected <span className="gradient-text">Platforms</span>
          </h1>
          <p className="text-cme-text-muted">
            Manage your platform integrations for automated publishing
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 rounded-xl border border-cme-border bg-cme-surface/60 backdrop-blur-sm p-4">
        <div className="rounded-lg bg-cme-secondary/10 p-3">
          <Globe className="h-6 w-6 text-cme-secondary" />
        </div>
        <div className="flex-1">
          <p className="text-lg font-semibold text-cme-text">
            {isLoading ? (
              <Skeleton className="h-6 w-16 inline-block" variant="text" />
            ) : (
              <span className="font-mono">{connectedCount}</span>
            )}
            <span className="text-cme-text-muted font-normal text-sm ml-2">
              of {ALL_PLATFORMS.length} platforms connected
            </span>
          </p>
          <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-cme-surface-hover">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cme-primary to-cme-secondary transition-all duration-500"
              style={{
                width: `${(connectedCount / ALL_PLATFORMS.length) * 100}%`,
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-cme-text-muted">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>OAuth 2.0 secured</span>
        </div>
      </div>

      {/* Platform Grid by Tier */}
      {isLoading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-40" variant="text" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-32 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(tiers)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([tier, platforms]) => (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline" className="text-[10px]">
                    Tier {tier}
                  </Badge>
                  <h2 className="text-sm font-semibold text-cme-text">
                    {TIER_LABELS[Number(tier)] || `Tier ${tier}`}
                  </h2>
                  <div className="flex-1 h-px bg-cme-border" />
                  <span className="text-[10px] text-cme-text-muted">
                    {platforms.filter((p) => getConnection(p.id)).length}/{platforms.length} connected
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {platforms.map((platform) => (
                    <PlatformCard
                      key={platform.id}
                      platform={platform}
                      connection={getConnection(platform.id)}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      isActioning={
                        actioningPlatform === platform.id ||
                        (isConnecting && actioningPlatform === platform.id)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Info note */}
      <Card className="border-cme-border/50">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="shrink-0 rounded-lg bg-cme-primary/10 p-2 mt-0.5">
            <ShieldCheck className="h-4 w-4 text-cme-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-cme-text">
              Secure Platform Access
            </p>
            <p className="text-xs text-cme-text-muted mt-0.5 leading-relaxed">
              Pandocast uses OAuth 2.0 to securely connect to your platforms.
              We never store your passwords. You can revoke access at any time.
              Connected platforms enable direct publishing from your content calendar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bluesky App Password Dialog */}
      <BlueskyDialog
        open={blueskyDialogOpen}
        onClose={() => setBlueskyDialogOpen(false)}
        onSuccess={fetchConnections}
      />
    </div>
  );
}

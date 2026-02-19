'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Globe,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  MoreHorizontal,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PanicButton } from '@/components/autopilot/panic-button';
import { apiClient, ApiClientError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import type { SessionResponse, AuditLogEntry } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };

  let browser = 'Unknown';
  let os = 'Unknown';

  // OS detection
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Windows NT 10')) os = 'Windows 10';
  else if (ua.includes('Windows NT 11') || (ua.includes('Windows NT 10') && ua.includes('Win64'))) os = 'Windows';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  // Browser detection
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera';

  return { browser, os };
}

function getDeviceIcon(ua: string | null): React.ReactNode {
  if (!ua) return <Monitor className="h-4 w-4" />;
  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
    return <Smartphone className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Audit action config
// ---------------------------------------------------------------------------

interface AuditActionConfig {
  icon: React.ReactNode;
  color: string;
  label: string;
}

function getAuditConfig(action: string): AuditActionConfig {
  const configs: Record<string, AuditActionConfig> = {
    login: {
      icon: <LogIn className="h-3.5 w-3.5" />,
      color: 'text-cme-success',
      label: 'Signed in',
    },
    logout: {
      icon: <LogOut className="h-3.5 w-3.5" />,
      color: 'text-cme-text-muted',
      label: 'Signed out',
    },
    failed_login: {
      icon: <UserX className="h-3.5 w-3.5" />,
      color: 'text-cme-error',
      label: 'Failed login attempt',
    },
    password_change: {
      icon: <KeyRound className="h-3.5 w-3.5" />,
      color: 'text-cme-warning',
      label: 'Password changed',
    },
    session_revoked: {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      color: 'text-cme-warning',
      label: 'Session revoked',
    },
    mfa_enabled: {
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      color: 'text-cme-success',
      label: 'MFA enabled',
    },
    mfa_disabled: {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      color: 'text-cme-error',
      label: 'MFA disabled',
    },
    api_key_created: {
      icon: <KeyRound className="h-3.5 w-3.5" />,
      color: 'text-cme-secondary',
      label: 'API key created',
    },
    platform_connected: {
      icon: <Globe className="h-3.5 w-3.5" />,
      color: 'text-cme-success',
      label: 'Platform connected',
    },
    platform_disconnected: {
      icon: <Globe className="h-3.5 w-3.5" />,
      color: 'text-cme-warning',
      label: 'Platform disconnected',
    },
    autopilot_enabled: {
      icon: <Shield className="h-3.5 w-3.5" />,
      color: 'text-cme-success',
      label: 'Autopilot enabled',
    },
    autopilot_disabled: {
      icon: <Shield className="h-3.5 w-3.5" />,
      color: 'text-cme-warning',
      label: 'Autopilot disabled',
    },
    panic_executed: {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      color: 'text-cme-error',
      label: 'Emergency stop executed',
    },
  };

  return (
    configs[action] ?? {
      icon: <MoreHorizontal className="h-3.5 w-3.5" />,
      color: 'text-cme-text-muted',
      label: action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  );
}

// ---------------------------------------------------------------------------
// Session Card
// ---------------------------------------------------------------------------

interface SessionCardProps {
  session: SessionResponse;
  isCurrent: boolean;
  onRevoke: (sessionId: string) => void;
  isRevoking: boolean;
}

function SessionCard({
  session,
  isCurrent,
  onRevoke,
  isRevoking,
}: SessionCardProps) {
  const { browser, os } = parseUserAgent(session.user_agent);
  const deviceIcon = getDeviceIcon(session.user_agent);

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border p-4 transition-all duration-200',
        isCurrent
          ? 'border-cme-success/30 bg-cme-success/5'
          : 'border-cme-border bg-cme-surface-hover/30 hover:bg-cme-surface-hover/50'
      )}
    >
      {/* Device icon */}
      <div
        className={cn(
          'shrink-0 rounded-lg p-2.5',
          isCurrent ? 'bg-cme-success/10 text-cme-success' : 'bg-cme-surface-hover text-cme-text-muted'
        )}
      >
        {deviceIcon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-cme-text">
            {browser} on {os}
          </p>
          {isCurrent && (
            <Badge variant="success" className="text-[10px]">
              Current
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-cme-text-muted">
          {session.ip_address && (
            <span className="font-mono">{session.ip_address}</span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(session.created_at)}
          </span>
        </div>
      </div>

      {/* Revoke button */}
      {!isCurrent && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRevoke(session.id)}
          disabled={isRevoking}
          className="shrink-0 gap-1.5 text-xs text-cme-text-muted hover:text-cme-error hover:border-cme-error/50"
        >
          {isRevoking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
          Revoke
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Log Entry
// ---------------------------------------------------------------------------

interface AuditEntryProps {
  entry: AuditLogEntry;
}

function AuditEntry({ entry }: AuditEntryProps) {
  const config = getAuditConfig(entry.action);

  return (
    <div className="flex items-start gap-3 py-3">
      {/* Timeline dot */}
      <div className="relative mt-0.5">
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full border',
            'bg-cme-surface',
            config.color === 'text-cme-success' && 'border-cme-success/30',
            config.color === 'text-cme-error' && 'border-cme-error/30',
            config.color === 'text-cme-warning' && 'border-cme-warning/30',
            config.color === 'text-cme-secondary' && 'border-cme-secondary/30',
            config.color === 'text-cme-text-muted' && 'border-cme-border'
          )}
        >
          <span className={config.color}>{config.icon}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-cme-text">{config.label}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[11px] text-cme-text-muted">
            {formatRelativeTime(entry.created_at)}
          </span>
          {entry.ip_address && (
            <span className="text-[11px] font-mono text-cme-text-muted">
              {entry.ip_address}
            </span>
          )}
          {entry.resource_type && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              {entry.resource_type}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Security Page
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  const {
    success: showSuccess,
    error: showError,
    warning: showWarning,
  } = useToast();

  // Sessions state
  const [sessions, setSessions] = React.useState<SessionResponse[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = React.useState(true);
  const [revokingSession, setRevokingSession] = React.useState<string | null>(null);
  const [isRevokingAll, setIsRevokingAll] = React.useState(false);

  // Audit log state
  const [auditLog, setAuditLog] = React.useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = React.useState(true);
  const [auditPage, setAuditPage] = React.useState(0);
  const [hasMoreAudit, setHasMoreAudit] = React.useState(true);
  const [isLoadingMoreAudit, setIsLoadingMoreAudit] = React.useState(false);

  // Fetch sessions
  const fetchSessions = React.useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const response = await apiClient.get<SessionResponse[]>(
        '/api/v1/auth/sessions'
      );
      setSessions(response);
    } catch {
      setSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  // Fetch audit log
  const fetchAuditLog = React.useCallback(
    async (page: number, append: boolean) => {
      if (page === 0) setIsLoadingAudit(true);
      else setIsLoadingMoreAudit(true);

      try {
        const response = await apiClient.get<AuditLogEntry[]>(
          `/api/v1/auth/audit-log?skip=${page * 20}&limit=20`
        );
        if (append) {
          setAuditLog((prev) => [...prev, ...response]);
        } else {
          setAuditLog(response);
        }
        setHasMoreAudit(response.length === 20);
      } catch {
        if (!append) setAuditLog([]);
        setHasMoreAudit(false);
      } finally {
        setIsLoadingAudit(false);
        setIsLoadingMoreAudit(false);
      }
    },
    []
  );

  React.useEffect(() => {
    fetchSessions();
    fetchAuditLog(0, false);
  }, [fetchSessions, fetchAuditLog]);

  // Revoke a session
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await apiClient.delete(`/api/v1/auth/sessions/${sessionId}`);
      showSuccess('Session Revoked', 'The session has been terminated.');
      await fetchSessions();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Failed to revoke', err.detail);
      } else {
        showError('Failed to revoke', 'An unexpected error occurred.');
      }
    } finally {
      setRevokingSession(null);
    }
  };

  // Revoke all other sessions
  const handleRevokeAll = async () => {
    setIsRevokingAll(true);
    try {
      await apiClient.post('/api/v1/auth/sessions/revoke-all');
      showSuccess(
        'All Sessions Revoked',
        'All other sessions have been terminated.'
      );
      await fetchSessions();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Failed to revoke', err.detail);
      } else {
        showError('Failed to revoke', 'An unexpected error occurred.');
      }
    } finally {
      setIsRevokingAll(false);
    }
  };

  // Load more audit entries
  const handleLoadMoreAudit = () => {
    const nextPage = auditPage + 1;
    setAuditPage(nextPage);
    fetchAuditLog(nextPage, true);
  };

  // Panic handler
  const handlePanic = async () => {
    try {
      await apiClient.post('/api/v1/autopilot/panic');
      showWarning(
        'Emergency Stop Executed',
        'All connections, sessions, and autopilot have been revoked.'
      );
      await fetchSessions();
      await fetchAuditLog(0, false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Emergency stop failed', err.detail);
      } else {
        showError('Emergency stop failed', 'An unexpected error occurred.');
      }
    }
  };

  // MFA placeholder
  const handleEnableMFA = () => {
    showWarning(
      'Coming Soon',
      'Two-factor authentication will be available in a future update.'
    );
  };

  // Identify current session (first active one, heuristic)
  const currentSession = sessions.find((s) => s.is_active) ?? null;
  const otherSessions = sessions.filter(
    (s) => s.id !== currentSession?.id
  );

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={ROUTES.SETTINGS}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-cme-text">
            <span className="gradient-text">Security</span>
          </h1>
          <p className="text-cme-text-muted">
            Manage sessions, review activity, and protect your account
          </p>
        </div>
      </div>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cme-secondary/10 p-2 text-cme-secondary">
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Devices currently signed into your account
                </CardDescription>
              </div>
            </div>
            {otherSessions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevokeAll}
                disabled={isRevokingAll}
                className="gap-1.5 text-xs text-cme-text-muted hover:text-cme-error hover:border-cme-error/50"
              >
                {isRevokingAll ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                Revoke All Others
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingSessions ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : sessions.length > 0 ? (
            <>
              {currentSession && (
                <SessionCard
                  session={currentSession}
                  isCurrent
                  onRevoke={handleRevokeSession}
                  isRevoking={false}
                />
              )}
              {otherSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isCurrent={false}
                  onRevoke={handleRevokeSession}
                  isRevoking={revokingSession === session.id}
                />
              ))}
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-cme-text-muted">
                No active sessions found
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Events / Audit Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cme-warning/10 p-2 text-cme-warning">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Security Events</CardTitle>
              <CardDescription>
                Recent security-related activity on your account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingAudit ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-full" variant="circular" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-40" variant="text" />
                    <Skeleton className="h-3 w-24" variant="text" />
                  </div>
                </div>
              ))}
            </div>
          ) : auditLog.length > 0 ? (
            <>
              <div className="divide-y divide-cme-border/50">
                {auditLog.map((entry) => (
                  <AuditEntry key={entry.id} entry={entry} />
                ))}
              </div>
              {hasMoreAudit && (
                <div className="pt-4 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLoadMoreAudit}
                    disabled={isLoadingMoreAudit}
                    className="gap-1.5 text-xs text-cme-text-muted"
                  >
                    {isLoadingMoreAudit ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <MoreHorizontal className="h-3 w-3" />
                    )}
                    Load More
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-cme-text-muted">
                No security events recorded yet
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MFA Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cme-primary/10 p-2 text-cme-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-cme-border bg-cme-surface-hover/30 p-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-cme-text-muted" />
              <div>
                <p className="text-sm font-medium text-cme-text">
                  MFA is not enabled
                </p>
                <p className="text-xs text-cme-text-muted">
                  Protect your account with an authenticator app
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnableMFA}
              className="gap-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Enable
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Panic Button Section */}
      <Card className="border-cme-error/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cme-error/10 p-2 text-cme-error">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-cme-error">
                Emergency: Revoke Everything
              </CardTitle>
              <CardDescription>
                Instantly disconnects all platforms, revokes all sessions, and
                disables all autopilot
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-cme-text-muted mb-4 leading-relaxed">
            If you suspect your account has been compromised, use this emergency
            action to immediately revoke all access. You will remain logged in on
            this device but all other sessions, connected platforms, and autopilot
            configurations will be terminated.
          </p>
          <PanicButton
            onConfirm={handlePanic}
            label="Emergency: Revoke Everything"
            description="This will disconnect all platforms, revoke every active session except your current one, and disable all autopilot configurations. This cannot be undone."
          />
        </CardContent>
      </Card>
    </div>
  );
}

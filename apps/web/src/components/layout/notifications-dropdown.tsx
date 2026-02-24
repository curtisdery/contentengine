'use client';

import * as React from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { callFunction } from '@/lib/cloud-functions';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  action_url?: string;
  created_at?: string;
}

interface NotificationsResponse {
  items: Notification[];
  unread_count: number;
}

function NotificationsDropdown() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const fetchNotifications = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await callFunction<{ limit: number }, NotificationsResponse>(
        'listNotifications',
        { limit: 20 },
      );
      setNotifications(res.items || []);
      setUnreadCount(res.unread_count || 0);
    } catch {
      // Silently fail — don't block the UI
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and every 60 seconds
  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Fetch when opened
  React.useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  // Click outside to close
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      await callFunction('markNotificationRead', { notification_id: notificationId });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silently fail
    }
  };

  const markAllRead = async () => {
    try {
      await callFunction('markAllNotificationsRead', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative rounded-lg p-2 text-cme-text-muted',
          'hover:bg-cme-surface-hover hover:text-cme-text transition-colors duration-200',
          'focus-ring',
          isOpen && 'bg-cme-surface-hover text-cme-text',
        )}
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cme-primary text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className={cn(
            'absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg',
            'border border-cme-border bg-cme-surface/95 backdrop-blur-xl',
            'shadow-lg shadow-black/20',
            'animate-fade-in',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cme-border px-4 py-3">
            <h3 className="text-sm font-semibold text-cme-text">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-cme-primary hover:text-cme-primary/80 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-cme-border border-t-cme-primary" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-cme-text-muted">
                <Bell className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => {
                    if (!notif.read) markAsRead(notif.id);
                    if (notif.action_url) {
                      window.location.href = notif.action_url;
                      setIsOpen(false);
                    }
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                    'hover:bg-cme-surface-hover',
                    'border-b border-cme-border/50 last:border-0',
                    !notif.read && 'bg-cme-primary/5',
                  )}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!notif.read ? (
                      <span className="block h-2 w-2 rounded-full bg-cme-primary" />
                    ) : (
                      <span className="block h-2 w-2" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-sm leading-snug',
                      notif.read ? 'text-cme-text-muted' : 'text-cme-text font-medium',
                    )}>
                      {notif.title}
                    </p>
                    <p className="mt-0.5 text-xs text-cme-text-muted line-clamp-2">
                      {notif.body}
                    </p>
                    <p className="mt-1 text-[10px] text-cme-text-muted/60">
                      {formatTime(notif.created_at)}
                    </p>
                  </div>

                  {/* Action indicator */}
                  {notif.action_url && (
                    <ExternalLink className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-cme-text-muted/40" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { NotificationsDropdown };

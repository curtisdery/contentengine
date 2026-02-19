'use client';

import * as React from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Send,
  RotateCcw,
  CalendarDays,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlatformBadge, getPlatformConfig } from '@/components/content/platform-badge';
import { Separator } from '@/components/ui/separator';
import type { ScheduledEventResponse } from '@/types/api';

interface EventDetailPanelProps {
  event: ScheduledEventResponse | null;
  onClose: () => void;
  onReschedule: (id: string, datetime: string) => void;
  onCancel: (id: string) => void;
  onPublishNow: (id: string) => void;
  onRetry?: (id: string) => void;
}

function EventDetailPanel({
  event,
  onClose,
  onReschedule,
  onCancel,
  onPublishNow,
  onRetry,
}: EventDetailPanelProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedDateTime, setEditedDateTime] = React.useState('');
  const [contentExpanded, setContentExpanded] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Set edited datetime when event changes
  React.useEffect(() => {
    if (event) {
      // Format for datetime-local input: "YYYY-MM-DDTHH:mm"
      const date = new Date(event.scheduled_at);
      const localISO = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setEditedDateTime(localISO);
      setIsEditing(false);
      setContentExpanded(false);
    }
  }, [event]);

  // Close on backdrop click
  const handleBackdropClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (event) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  const scheduledDate = new Date(event.scheduled_at);
  const platformConfig = getPlatformConfig(event.platform_id);

  const statusBadge = {
    scheduled: { variant: 'default' as const, label: 'Scheduled', icon: <Clock className="h-3 w-3" /> },
    publishing: { variant: 'warning' as const, label: 'Publishing', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    published: { variant: 'success' as const, label: 'Published', icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { variant: 'error' as const, label: 'Failed', icon: <AlertTriangle className="h-3 w-3" /> },
    cancelled: { variant: 'outline' as const, label: 'Cancelled', icon: <XCircle className="h-3 w-3" /> },
  }[event.status] || { variant: 'outline' as const, label: event.status, icon: null };

  const handleSaveReschedule = () => {
    if (editedDateTime) {
      const newDate = new Date(editedDateTime);
      onReschedule(event.id, newDate.toISOString());
      setIsEditing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 flex h-full w-full max-w-md flex-col',
          'border-l border-cme-border bg-cme-surface/95 backdrop-blur-xl',
          'shadow-2xl shadow-black/30',
          'animate-slide-in-right'
        )}
        style={{
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cme-border p-5">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="shrink-0 rounded-lg p-2"
              style={{ backgroundColor: `${platformConfig.color}15` }}
            >
              <CalendarDays className="h-5 w-5" style={{ color: platformConfig.color }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-cme-text truncate">
                Event Details
              </h2>
              <p className="text-xs text-cme-text-muted">
                {event.content_title || 'Untitled content'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Platform & Status */}
          <div className="flex items-center justify-between">
            <PlatformBadge platformId={event.platform_id} />
            <Badge variant={statusBadge.variant} dot>
              {statusBadge.label}
            </Badge>
          </div>

          {event.output_format_name && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-cme-text-muted">Format:</span>
              <span className="text-sm font-medium text-cme-text">
                {event.output_format_name}
              </span>
            </div>
          )}

          <Separator />

          {/* Scheduled Time */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
                Scheduled Time
              </span>
              {event.status === 'scheduled' && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-cme-primary hover:text-cme-primary/80 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="datetime-local"
                  value={editedDateTime}
                  onChange={(e) => setEditedDateTime(e.target.value)}
                  className={cn(
                    'w-full rounded-lg border border-cme-border bg-cme-bg px-3 py-2 text-sm text-cme-text',
                    'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                    '[color-scheme:dark]'
                  )}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveReschedule} className="flex-1">
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-cme-border bg-cme-bg/50 p-3">
                <p className="text-sm font-medium text-cme-text">
                  {scheduledDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-xs text-cme-text-muted mt-0.5">
                  {scheduledDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZoneName: 'short',
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Published At */}
          {event.published_at && (
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
                Published At
              </span>
              <p className="text-sm text-cme-success">
                {new Date(event.published_at).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          )}

          <Separator />

          {/* Content Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-cme-text-muted">
                Content Preview
              </span>
              {event.output_content && event.output_content.length > 200 && (
                <button
                  onClick={() => setContentExpanded(!contentExpanded)}
                  className="flex items-center gap-1 text-xs text-cme-primary hover:text-cme-primary/80 transition-colors"
                >
                  {contentExpanded ? (
                    <>
                      Collapse <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Expand <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>

            <div
              className={cn(
                'rounded-lg border border-cme-border bg-cme-bg/50 p-3',
                'transition-all duration-300'
              )}
            >
              {event.output_content ? (
                <p
                  className={cn(
                    'text-sm text-cme-text whitespace-pre-wrap leading-relaxed',
                    !contentExpanded && 'line-clamp-6'
                  )}
                >
                  {event.output_content}
                </p>
              ) : (
                <p className="text-sm text-cme-text-muted italic">
                  No content preview available
                </p>
              )}
            </div>
          </div>

          {/* Failed Error */}
          {event.status === 'failed' && event.publish_error && (
            <>
              <Separator />
              <div className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wider text-cme-error">
                  Error Details
                </span>
                <div className="rounded-lg border border-cme-error/30 bg-cme-error/5 p-3">
                  <p className="text-sm text-cme-error">{event.publish_error}</p>
                  <p className="mt-1 text-xs text-cme-text-muted">
                    Retry count: {event.retry_count}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Meta Info */}
          <Separator />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-cme-text-muted">Priority</span>
              <p className="text-cme-text font-mono mt-0.5">{event.priority}</p>
            </div>
            <div>
              <span className="text-cme-text-muted">Event ID</span>
              <p className="text-cme-text font-mono mt-0.5 truncate">{event.id.slice(0, 8)}...</p>
            </div>
            <div>
              <span className="text-cme-text-muted">Created</span>
              <p className="text-cme-text mt-0.5">
                {new Date(event.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div>
              <span className="text-cme-text-muted">Updated</span>
              <p className="text-cme-text mt-0.5">
                {new Date(event.updated_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="border-t border-cme-border p-5 space-y-3">
          {event.status === 'scheduled' && (
            <div className="flex gap-2">
              <Button
                onClick={() => onPublishNow(event.id)}
                className="flex-1 gap-2"
              >
                <Send className="h-4 w-4" />
                Publish Now
              </Button>
              <Button
                variant="destructive"
                onClick={() => onCancel(event.id)}
                className="flex-1 gap-2"
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}

          {event.status === 'failed' && onRetry && (
            <Button
              onClick={() => onRetry(event.id)}
              className="w-full gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Publishing
            </Button>
          )}

          {event.status === 'publishing' && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-amber-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Publishing in progress...
            </div>
          )}

          {event.status === 'published' && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-cme-success">
              <CheckCircle2 className="h-4 w-4" />
              Successfully published
            </div>
          )}

          {event.status === 'cancelled' && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-cme-text-muted">
              <XCircle className="h-4 w-4" />
              This event has been cancelled
            </div>
          )}
        </div>
      </div>

      {/* Inline styles for the slide-in animation */}
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0.5;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export { EventDetailPanel };

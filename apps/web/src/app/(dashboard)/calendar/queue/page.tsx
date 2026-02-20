'use client';

import * as React from 'react';
import {
  ListChecks,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  XCircle,
  ChevronDown,
  Loader2,
  ArrowLeft,
  RotateCcw,
  Edit3,
  Check,
  X,
  CalendarDays,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PlatformBadge, getPlatformConfig, platformMap } from '@/components/content/platform-badge';
import { apiClient, ApiClientError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import type {
  ScheduledEventResponse,
  CalendarEventsResponse,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'scheduled' | 'publishing' | 'published' | 'failed';

const STATUS_TABS: { key: StatusFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'All', icon: <ListChecks className="h-3.5 w-3.5" /> },
  { key: 'scheduled', label: 'Pending', icon: <Clock className="h-3.5 w-3.5" /> },
  { key: 'published', label: 'Published', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { key: 'failed', label: 'Failed', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
];

// ---------------------------------------------------------------------------
// Queue Item Component
// ---------------------------------------------------------------------------

interface QueueItemProps {
  event: ScheduledEventResponse;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onPublish: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onEditContent: (id: string, content: string) => void;
}

function QueueItem({
  event,
  isSelected,
  onToggleSelect,
  onPublish,
  onCancel,
  onRetry,
  onEditContent,
}: QueueItemProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedContent, setEditedContent] = React.useState(event.output_content || '');

  const scheduledDate = new Date(event.scheduled_at);
  const isPast = scheduledDate < new Date();

  const statusBadge: Record<string, { variant: 'default' | 'success' | 'warning' | 'error' | 'outline'; label: string }> = {
    scheduled: { variant: 'default', label: 'Scheduled' },
    publishing: { variant: 'warning', label: 'Publishing' },
    published: { variant: 'success', label: 'Published' },
    failed: { variant: 'error', label: 'Failed' },
    cancelled: { variant: 'outline', label: 'Cancelled' },
  };

  const badge = statusBadge[event.status] || { variant: 'outline' as const, label: event.status };

  const handleSaveEdit = () => {
    onEditContent(event.id, editedContent);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        'group rounded-xl border bg-cme-surface/60 backdrop-blur-sm transition-all duration-200',
        'hover:border-cme-border-bright hover:bg-cme-surface-hover/40',
        isSelected && 'border-cme-primary/40 bg-cme-primary/5',
        event.status === 'failed' && 'border-cme-error/20',
        event.status === 'published' && 'border-cme-success/20 opacity-70',
        !isSelected && event.status !== 'failed' && event.status !== 'published' && 'border-cme-border'
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          {event.status === 'scheduled' && (
            <button
              onClick={() => onToggleSelect(event.id)}
              className={cn(
                'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                isSelected
                  ? 'border-cme-primary bg-cme-primary text-white'
                  : 'border-cme-border hover:border-cme-border-bright'
              )}
            >
              {isSelected && <Check className="h-3 w-3" />}
            </button>
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Top row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <PlatformBadge platformId={event.platform_id} size="sm" />
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>

              <div className="flex items-center gap-1 text-xs text-cme-text-muted shrink-0">
                <Clock className="h-3 w-3" />
                <span className="font-mono">
                  {scheduledDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' '}
                  {scheduledDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </span>
                {isPast && event.status === 'scheduled' && (
                  <span className="ml-1 text-cme-warning">(overdue)</span>
                )}
              </div>
            </div>

            {/* Format name */}
            {event.output_format_name && (
              <span className="text-[11px] rounded bg-cme-surface-hover px-2 py-0.5 text-cme-text-muted">
                {event.output_format_name}
              </span>
            )}

            {/* Content title */}
            {event.content_title && (
              <p className="text-xs text-cme-text-muted">
                From: <span className="text-cme-text">{event.content_title}</span>
              </p>
            )}

            {/* Content preview / edit */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  rows={4}
                  className={cn(
                    'w-full rounded-lg border border-cme-border bg-cme-bg px-3 py-2 text-sm text-cme-text',
                    'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                    'resize-y'
                  )}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit} className="gap-1">
                    <Check className="h-3 w-3" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditedContent(event.output_content || '');
                    }}
                    className="gap-1"
                  >
                    <X className="h-3 w-3" />
                    Discard
                  </Button>
                </div>
              </div>
            ) : (
              event.output_content && (
                <p className="text-sm text-cme-text/80 line-clamp-2 leading-relaxed">
                  {event.output_content}
                </p>
              )
            )}

            {/* Failed error */}
            {event.status === 'failed' && event.publish_error && (
              <div className="flex items-center gap-1.5 text-xs text-cme-error">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{event.publish_error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              {event.status === 'scheduled' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onPublish(event.id)}
                    className="gap-1.5 h-7 text-xs"
                  >
                    <Send className="h-3 w-3" />
                    Publish Now
                  </Button>
                  {!isEditing && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsEditing(true)}
                      className="gap-1.5 h-7 text-xs"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onCancel(event.id)}
                    className="gap-1.5 h-7 text-xs text-cme-error hover:text-cme-error"
                  >
                    <XCircle className="h-3 w-3" />
                    Cancel
                  </Button>
                </>
              )}
              {event.status === 'failed' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRetry(event.id)}
                  className="gap-1.5 h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Queue Page
// ---------------------------------------------------------------------------

export default function QueuePage() {
  const { success: showSuccess, error: showError } = useToast();

  const [events, setEvents] = React.useState<ScheduledEventResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [platformFilter, setPlatformFilter] = React.useState<string>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isBulkActioning, setIsBulkActioning] = React.useState(false);
  const [showPlatformDropdown, setShowPlatformDropdown] = React.useState(false);

  // Fetch events
  const fetchEvents = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch upcoming events (next 30 days)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7); // Include recent past events
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);

      const response = await apiClient.get<CalendarEventsResponse>(
        `/api/v1/calendar/events?start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}&limit=100`
      );
      setEvents(response.events);
    } catch {
      showError('Failed to load queue', 'Could not fetch scheduled events.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  React.useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Filtered events
  const filteredEvents = React.useMemo(() => {
    let filtered = events;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }

    if (platformFilter !== 'all') {
      filtered = filtered.filter((e) => e.platform_id === platformFilter);
    }

    // Sort by scheduled_at ascending
    return filtered.sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
  }, [events, statusFilter, platformFilter]);

  // Unique platforms in events
  const platformsInEvents = React.useMemo(() => {
    const platformIds = new Set(events.map((e) => e.platform_id));
    return Array.from(platformIds);
  }, [events]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all scheduled events
  const selectAllScheduled = () => {
    const scheduledIds = filteredEvents
      .filter((e) => e.status === 'scheduled')
      .map((e) => e.id);
    setSelectedIds(new Set(scheduledIds));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Bulk approve / publish
  const handleBulkPublish = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkActioning(true);

    try {
      const promises = Array.from(selectedIds).map((id) =>
        apiClient.post(`/api/v1/calendar/events/${id}/publish-now`).catch(() => null)
      );
      await Promise.all(promises);
      showSuccess('Bulk publish initiated', `${selectedIds.size} events are being published.`);
      setSelectedIds(new Set());
      await fetchEvents();
    } catch {
      showError('Bulk publish failed', 'Some events could not be published.');
    } finally {
      setIsBulkActioning(false);
    }
  };

  // Individual actions
  const handlePublish = async (id: string) => {
    try {
      await apiClient.post(`/api/v1/calendar/events/${id}/publish-now`);
      showSuccess('Publishing started', 'Your content is being published.');
      await fetchEvents();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Publish failed', err.detail);
      } else {
        showError('Publish failed', 'An unexpected error occurred.');
      }
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await apiClient.delete(`/api/v1/calendar/events/${id}`);
      showSuccess('Event cancelled', 'The scheduled event has been cancelled.');
      await fetchEvents();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Cancel failed', err.detail);
      } else {
        showError('Cancel failed', 'An unexpected error occurred.');
      }
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await apiClient.post(`/api/v1/calendar/events/${id}/publish-now`);
      showSuccess('Retry initiated', 'Retrying publication...');
      await fetchEvents();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Retry failed', err.detail);
      } else {
        showError('Retry failed', 'An unexpected error occurred.');
      }
    }
  };

  const handleEditContent = async (id: string, content: string) => {
    try {
      await apiClient.patch(`/api/v1/calendar/events/${id}`, { output_content: content });
      showSuccess('Content updated', 'The event content has been saved.');
      await fetchEvents();
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Update failed', err.detail);
      } else {
        showError('Update failed', 'An unexpected error occurred.');
      }
    }
  };

  // Counts per status
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: events.length };
    events.forEach((e) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    return counts;
  }, [events]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href={ROUTES.CALENDAR}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-cme-text">
              Publishing <span className="gradient-text">Queue</span>
            </h1>
            <p className="text-cme-text-muted">
              Review and approve upcoming scheduled content
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Platform filter */}
          <div className="relative">
            <button
              onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-cme-border px-3 py-2 text-xs',
                'text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors'
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {platformFilter === 'all'
                ? 'All Platforms'
                : getPlatformConfig(platformFilter).name}
              <ChevronDown className="h-3 w-3" />
            </button>

            {showPlatformDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowPlatformDropdown(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-cme-border bg-cme-surface shadow-xl">
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setPlatformFilter('all');
                        setShowPlatformDropdown(false);
                      }}
                      className={cn(
                        'w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors',
                        platformFilter === 'all'
                          ? 'bg-cme-primary/10 text-cme-primary'
                          : 'text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover'
                      )}
                    >
                      All Platforms
                    </button>
                    {platformsInEvents.map((pid) => {
                      const pc = getPlatformConfig(pid);
                      return (
                        <button
                          key={pid}
                          onClick={() => {
                            setPlatformFilter(pid);
                            setShowPlatformDropdown(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors',
                            platformFilter === pid
                              ? 'bg-cme-primary/10 text-cme-primary'
                              : 'text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover'
                          )}
                        >
                          <span className={cn('h-2 w-2 rounded-full', pc.bgClass)} />
                          {pc.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-cme-border bg-cme-surface/60 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-200',
              statusFilter === tab.key
                ? 'bg-cme-primary text-white shadow-sm'
                : 'text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover'
            )}
          >
            {tab.icon}
            {tab.label}
            <span
              className={cn(
                'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-mono',
                statusFilter === tab.key
                  ? 'bg-white/20'
                  : 'bg-cme-surface-hover text-cme-text-muted'
              )}
            >
              {statusCounts[tab.key] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-cme-primary/30 bg-cme-primary/5 px-4 py-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-cme-text">
              {selectedIds.size} selected
            </span>
            <button
              onClick={clearSelection}
              className="text-xs text-cme-text-muted hover:text-cme-text transition-colors"
            >
              Clear
            </button>
            <button
              onClick={selectAllScheduled}
              className="text-xs text-cme-primary hover:text-cme-primary/80 transition-colors"
            >
              Select All Pending
            </button>
          </div>
          <Button
            size="sm"
            onClick={handleBulkPublish}
            isLoading={isBulkActioning}
            className="gap-2"
          >
            <Send className="h-3.5 w-3.5" />
            Publish Selected ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* Events List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-2xl bg-cme-surface-hover p-5">
              <ListChecks className="h-10 w-10 text-cme-text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-cme-text mb-1">
              No events found
            </h3>
            <p className="text-sm text-cme-text-muted max-w-sm">
              {statusFilter !== 'all'
                ? `No ${statusFilter} events match your filters.`
                : 'Your publishing queue is empty. Use Auto-Schedule from the calendar to add events.'}
            </p>
            <Link href={ROUTES.CALENDAR} className="mt-4">
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                Go to Calendar
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Group by date */}
          {(() => {
            let lastDate = '';
            return filteredEvents.map((event) => {
              const eventDate = new Date(event.scheduled_at).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              });
              const showDateHeader = eventDate !== lastDate;
              lastDate = eventDate;

              return (
                <React.Fragment key={event.id}>
                  {showDateHeader && (
                    <div className="flex items-center gap-3 pt-4 pb-1">
                      <span className="text-xs font-semibold text-cme-text-muted uppercase tracking-wider">
                        {eventDate}
                      </span>
                      <div className="flex-1 h-px bg-cme-border" />
                    </div>
                  )}
                  <QueueItem
                    event={event}
                    isSelected={selectedIds.has(event.id)}
                    onToggleSelect={toggleSelect}
                    onPublish={handlePublish}
                    onCancel={handleCancel}
                    onRetry={handleRetry}
                    onEditContent={handleEditContent}
                  />
                </React.Fragment>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

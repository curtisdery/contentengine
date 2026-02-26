'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Loader2,
  ListChecks,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getPlatformConfig } from '@/components/content/platform-badge';
import { EventCard } from '@/components/calendar/event-card';
import { EventDetailPanel } from '@/components/calendar/event-detail-panel';
import { ContentGapAlert } from '@/components/calendar/content-gap-alert';
import { AutoScheduleModal } from '@/components/calendar/auto-schedule-modal';
import { callFunction, ApiClientError } from '@/lib/cloud-functions';
import { useToast } from '@/hooks/use-toast';
import { ROUTES } from '@/lib/constants';
import { PageTitle } from '@/components/layout/page-title';
import type {
  ScheduledEventResponse,
  CalendarEventsResponse,
  CalendarStatsResponse,
} from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ViewMode = 'week' | 'month';

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function formatWeekLabel(weekStart: Date): string {
  return `Week of ${weekStart.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

interface StatItemProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatItem({ label, value, icon, color }: StatItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-cme-border bg-cme-surface/60 px-4 py-3 backdrop-blur-sm">
      <div
        className="shrink-0 rounded-lg p-2"
        style={{ backgroundColor: `${color}15`, color }}
      >
        {icon}
      </div>
      <div>
        <p className="font-mono text-xl font-bold text-cme-text">{value}</p>
        <p className="text-[11px] text-cme-text-muted">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Calendar Page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const router = useRouter();
  const { success: showSuccess, error: showError } = useToast();

  // State
  const [view, setView] = React.useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [events, setEvents] = React.useState<ScheduledEventResponse[]>([]);
  const [stats, setStats] = React.useState<CalendarStatsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedEvent, setSelectedEvent] = React.useState<ScheduledEventResponse | null>(null);
  const [autoScheduleOpen, setAutoScheduleOpen] = React.useState(false);
  const [draggedEventId, setDraggedEventId] = React.useState<string | null>(null);

  // Computed dates — memoised so references are stable across re-renders
  const weekStart = React.useMemo(() => getWeekStart(currentDate), [currentDate]);
  const monthStart = React.useMemo(() => getMonthStart(currentDate), [currentDate]);
  const weekDays = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Month grid: weeks of the month
  const monthWeeks = React.useMemo(() => {
    const firstDay = new Date(monthStart);
    const dayOfWeek = firstDay.getDay();
    const startOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const gridStart = addDays(firstDay, startOffset);

    const weeks: Date[][] = [];
    let current = gridStart;
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(current));
        current = addDays(current, 1);
      }
      weeks.push(week);
      // Stop if we've passed the end of the month
      if (current.getMonth() !== monthStart.getMonth() && w >= 3) break;
    }
    return weeks;
  }, [monthStart]);

  // API date range for fetching
  const fetchRange = React.useMemo(() => {
    if (view === 'week') {
      return {
        start: weekStart.toISOString(),
        end: addDays(weekStart, 7).toISOString(),
      };
    }
    const mStart = monthWeeks[0][0];
    const mEnd = addDays(monthWeeks[monthWeeks.length - 1][6], 1);
    return {
      start: mStart.toISOString(),
      end: mEnd.toISOString(),
    };
  }, [view, weekStart, monthWeeks]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [eventsRes, statsRes] = await Promise.all([
        callFunction<{ start: string; end: string }, CalendarEventsResponse>('getCalendarEvents', { start: fetchRange.start, end: fetchRange.end })
          .catch(() => ({ events: [], total: 0 }) as CalendarEventsResponse),
        callFunction<Record<string, unknown>, CalendarStatsResponse>('getCalendarStats', {})
          .catch(() => null),
      ]);
      setEvents(eventsRes.events);
      setStats(statsRes);
    } catch {
      showError('Failed to load calendar', 'Please try refreshing the page.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchRange, showError]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const goToday = () => setCurrentDate(new Date());

  const goPrev = () => {
    if (view === 'week') {
      setCurrentDate(addDays(currentDate, -7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }
  };

  const goNext = () => {
    if (view === 'week') {
      setCurrentDate(addDays(currentDate, 7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
  };

  // ---------------------------------------------------------------------------
  // Event actions
  // ---------------------------------------------------------------------------

  const handleReschedule = async (eventId: string, newDatetime: string) => {
    try {
      await callFunction('rescheduleOutput', { event_id: eventId, scheduled_at: newDatetime });
      const updatedEvent = events.find((e) => e.id === eventId);
      const platformName = updatedEvent
        ? getPlatformConfig(updatedEvent.platform_id).name
        : 'Post';
      const newDate = new Date(newDatetime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      showSuccess('Event rescheduled', `Moved ${platformName} post to ${newDate}`);
      await fetchData();
      setSelectedEvent(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Reschedule failed', err.detail);
      } else {
        showError('Reschedule failed', 'An unexpected error occurred.');
      }
    }
  };

  const handleCancel = async (eventId: string) => {
    try {
      await callFunction('cancelEvent', { event_id: eventId });
      showSuccess('Event cancelled', 'The scheduled event has been cancelled.');
      await fetchData();
      setSelectedEvent(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Cancel failed', err.detail);
      } else {
        showError('Cancel failed', 'An unexpected error occurred.');
      }
    }
  };

  const handlePublishNow = async (eventId: string) => {
    try {
      await callFunction('publishNow', { event_id: eventId });
      showSuccess('Publishing started', 'Your content is being published now.');
      const { trackEvent } = await import('@/lib/analytics');
      trackEvent('content_published');
      await fetchData();
      setSelectedEvent(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Publish failed', err.detail);
      } else {
        showError('Publish failed', 'An unexpected error occurred.');
      }
    }
  };

  const handleRetry = async (eventId: string) => {
    try {
      await callFunction('publishNow', { event_id: eventId });
      showSuccess('Retry initiated', 'Retrying publication...');
      await fetchData();
      setSelectedEvent(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Retry failed', err.detail);
      } else {
        showError('Retry failed', 'An unexpected error occurred.');
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Drag and Drop
  // ---------------------------------------------------------------------------

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, event: ScheduledEventResponse) => {
    setDraggedEventId(event.id);
    e.dataTransfer.setData('text/plain', event.id);
    e.dataTransfer.effectAllowed = 'move';
    // Create ghost element styling
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.4';
    }
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    setDraggedEventId(null);
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnHour = (e: React.DragEvent<HTMLDivElement>, day: Date, hour: number) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData('text/plain');
    if (!eventId) return;

    const newDate = new Date(day);
    newDate.setHours(hour, 0, 0, 0);
    handleReschedule(eventId, newDate.toISOString());
    setDraggedEventId(null);
  };

  const handleDropOnDay = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData('text/plain');
    if (!eventId) return;

    // Keep the original time, just change the date
    const draggedEvent = events.find((ev) => ev.id === eventId);
    if (!draggedEvent) return;

    const originalDate = new Date(draggedEvent.scheduled_at);
    const newDate = new Date(day);
    newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
    handleReschedule(eventId, newDate.toISOString());
    setDraggedEventId(null);
  };

  // ---------------------------------------------------------------------------
  // Events grouped for rendering
  // ---------------------------------------------------------------------------

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.scheduled_at), day));

  const getEventsForHour = (day: Date, hour: number) =>
    events.filter((e) => {
      const d = new Date(e.scheduled_at);
      return isSameDay(d, day) && d.getHours() === hour;
    });

  // Current time position for "now" indicator
  const now = new Date();
  const nowHour = now.getHours();
  const nowMinutes = now.getMinutes();
  const nowPercentInHour = (nowMinutes / 60) * 100;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 animate-fade-in">
      <PageTitle title="Calendar" />
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-cme-text">
            Content <span className="gradient-text">Calendar</span>
          </h1>
          <p className="text-cme-text-muted">
            Schedule, visualize, and manage your publishing pipeline
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push(ROUTES.CALENDAR_QUEUE)}>
            <ListChecks className="h-4 w-4" />
            Queue
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => setAutoScheduleOpen(true)}
          >
            <Sparkles className="h-4 w-4" />
            Auto-Schedule
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-lg" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatItem
            label="Scheduled Today"
            value={stats.upcoming_today}
            icon={<Clock className="h-4 w-4" />}
            color="#6c5ce7"
          />
          <StatItem
            label="This Week"
            value={stats.upcoming_this_week}
            icon={<CalendarDays className="h-4 w-4" />}
            color="#00cec9"
          />
          <StatItem
            label="Published"
            value={stats.total_published}
            icon={<CheckCircle2 className="h-4 w-4" />}
            color="#00b894"
          />
          <StatItem
            label="Failed"
            value={stats.total_failed}
            icon={<AlertTriangle className="h-4 w-4" />}
            color="#e17055"
          />
        </div>
      ) : null}

      {/* Content Gap Alert */}
      {stats && stats.content_gaps.length > 0 && (
        <ContentGapAlert gaps={stats.content_gaps} />
      )}

      {/* Calendar Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex rounded-lg border border-cme-border bg-cme-surface/60 p-0.5">
            <button
              onClick={() => setView('week')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                view === 'week'
                  ? 'bg-cme-primary text-white shadow-sm'
                  : 'text-cme-text-muted hover:text-cme-text'
              )}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                view === 'month'
                  ? 'bg-cme-primary text-white shadow-sm'
                  : 'text-cme-text-muted hover:text-cme-text'
              )}
            >
              Month
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="rounded-lg border border-cme-border p-2 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={goToday}
            className="rounded-lg border border-cme-border px-3 py-1.5 text-xs font-medium text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
          >
            Today
          </button>

          <button
            onClick={goNext}
            className="rounded-lg border border-cme-border p-2 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="ml-2 text-sm font-semibold text-cme-text">
            {view === 'week' ? formatWeekLabel(weekStart) : formatMonthLabel(currentDate)}
          </span>
        </div>
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : view === 'week' ? (
        <WeekView
          days={weekDays}
          events={events}
          now={now}
          nowHour={nowHour}
          nowPercentInHour={nowPercentInHour}
          draggedEventId={draggedEventId}
          getEventsForHour={getEventsForHour}
          onEventClick={setSelectedEvent}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDropOnHour={handleDropOnHour}
        />
      ) : (
        <MonthView
          weeks={monthWeeks}
          monthStart={monthStart}
          events={events}
          draggedEventId={draggedEventId}
          getEventsForDay={getEventsForDay}
          onEventClick={setSelectedEvent}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDropOnDay={handleDropOnDay}
        />
      )}

      {/* Event Detail Panel */}
      <EventDetailPanel
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onReschedule={handleReschedule}
        onCancel={handleCancel}
        onPublishNow={handlePublishNow}
        onRetry={handleRetry}
      />

      {/* Auto-Schedule Modal */}
      <AutoScheduleModal
        isOpen={autoScheduleOpen}
        onClose={() => setAutoScheduleOpen(false)}
        onSuccess={() => {
          setAutoScheduleOpen(false);
          fetchData();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week View Component
// ---------------------------------------------------------------------------

interface WeekViewProps {
  days: Date[];
  events: ScheduledEventResponse[];
  now: Date;
  nowHour: number;
  nowPercentInHour: number;
  draggedEventId: string | null;
  getEventsForHour: (day: Date, hour: number) => ScheduledEventResponse[];
  onEventClick: (event: ScheduledEventResponse) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, event: ScheduledEventResponse) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnHour: (e: React.DragEvent<HTMLDivElement>, day: Date, hour: number) => void;
}

function WeekView({
  days,
  now,
  nowHour,
  nowPercentInHour,
  draggedEventId,
  getEventsForHour,
  onEventClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnHour,
}: WeekViewProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Scroll to current hour on mount
  React.useEffect(() => {
    if (scrollRef.current) {
      const hourHeight = 64; // 16 * 4 = h-16
      const scrollTarget = Math.max(0, (nowHour - 2) * hourHeight);
      scrollRef.current.scrollTop = scrollTarget;
    }
  }, [nowHour]);

  const showNowLine = days.some((d) => isToday(d));

  return (
    <Card className="overflow-hidden">
      {/* Column Headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-cme-border">
        <div className="border-r border-cme-border bg-cme-surface/40 p-2" />
        {days.map((day, i) => (
          <div
            key={i}
            className={cn(
              'border-r border-cme-border bg-cme-surface/40 p-2 text-center last:border-r-0',
              isToday(day) && 'bg-cme-primary/5'
            )}
          >
            <p className="text-[10px] uppercase tracking-wider text-cme-text-muted">
              {DAY_NAMES[i]}
            </p>
            <p
              className={cn(
                'text-lg font-bold',
                isToday(day) ? 'text-cme-primary' : 'text-cme-text'
              )}
            >
              {day.getDate()}
            </p>
            {isToday(day) && (
              <div className="mx-auto mt-0.5 h-1 w-1 rounded-full bg-cme-primary" />
            )}
          </div>
        ))}
      </div>

      {/* Time Grid */}
      <div ref={scrollRef} className="relative max-h-[600px] overflow-y-auto">
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-cme-border/50"
          >
            {/* Hour label */}
            <div className="flex items-start justify-end border-r border-cme-border pr-2 pt-1">
              <span className="text-[10px] font-mono text-cme-text-muted">
                {hour === 0
                  ? '12 AM'
                  : hour < 12
                  ? `${hour} AM`
                  : hour === 12
                  ? '12 PM'
                  : `${hour - 12} PM`}
              </span>
            </div>

            {/* Day columns */}
            {days.map((day, dayIdx) => {
              const hourEvents = getEventsForHour(day, hour);
              const isTodayCol = isToday(day);
              const isNowHour = isTodayCol && hour === nowHour;

              return (
                <div
                  key={dayIdx}
                  className={cn(
                    'relative min-h-[64px] border-r border-cme-border/30 last:border-r-0 p-0.5',
                    isTodayCol && 'bg-cme-primary/[0.02]',
                    draggedEventId && 'hover:bg-cme-primary/5 transition-colors'
                  )}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDropOnHour(e, day, hour)}
                >
                  {/* Now indicator */}
                  {isNowHour && showNowLine && (
                    <div
                      className="absolute left-0 right-0 z-10 flex items-center pointer-events-none"
                      style={{ top: `${nowPercentInHour}%` }}
                    >
                      <div className="h-2.5 w-2.5 rounded-full bg-cme-error shadow-[0_0_6px_rgba(225,112,85,0.5)]" />
                      <div className="flex-1 h-[2px] bg-cme-error/70 shadow-[0_0_4px_rgba(225,112,85,0.3)]" />
                    </div>
                  )}

                  {/* Events */}
                  <div className="space-y-0.5">
                    {hourEvents.map((event) => (
                      <div
                        key={event.id}
                        onDragStart={(e) => onDragStart(e, event)}
                        onDragEnd={onDragEnd}
                      >
                        <EventCard
                          event={event}
                          onClick={() => onEventClick(event)}
                          onDragStart={(e) => onDragStart(e, event)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Month View Component
// ---------------------------------------------------------------------------

interface MonthViewProps {
  weeks: Date[][];
  monthStart: Date;
  events: ScheduledEventResponse[];
  draggedEventId: string | null;
  getEventsForDay: (day: Date) => ScheduledEventResponse[];
  onEventClick: (event: ScheduledEventResponse) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, event: ScheduledEventResponse) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnDay: (e: React.DragEvent<HTMLDivElement>, day: Date) => void;
}

function MonthView({
  weeks,
  monthStart,
  draggedEventId,
  getEventsForDay,
  onEventClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnDay,
}: MonthViewProps) {
  const [expandedDay, setExpandedDay] = React.useState<Date | null>(null);

  return (
    <Card className="overflow-hidden">
      {/* Day Headers */}
      <div className="grid grid-cols-7 border-b border-cme-border">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="border-r border-cme-border/50 last:border-r-0 bg-cme-surface/40 p-2 text-center"
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-cme-text-muted">
              {name}
            </span>
          </div>
        ))}
      </div>

      {/* Week Rows */}
      {weeks.map((week, weekIdx) => (
        <div key={weekIdx} className="grid grid-cols-7 border-b border-cme-border/50 last:border-b-0">
          {week.map((day, dayIdx) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = day.getMonth() === monthStart.getMonth();
            const todayClass = isToday(day);
            const isExpanded = expandedDay && isSameDay(expandedDay, day);
            const maxVisible = 3;

            // Group events by platform for dot display
            const platformCounts = dayEvents.reduce<Record<string, number>>((acc, ev) => {
              acc[ev.platform_id] = (acc[ev.platform_id] || 0) + 1;
              return acc;
            }, {});

            return (
              <div
                key={dayIdx}
                className={cn(
                  'relative min-h-[100px] border-r border-cme-border/30 last:border-r-0 p-1.5',
                  'transition-colors duration-150',
                  !isCurrentMonth && 'opacity-40',
                  todayClass && 'bg-cme-primary/[0.03]',
                  draggedEventId && 'hover:bg-cme-primary/5'
                )}
                onDragOver={onDragOver}
                onDrop={(e) => onDropOnDay(e, day)}
              >
                {/* Day Number */}
                <button
                  onClick={() => setExpandedDay(isExpanded ? null : day)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                    'transition-all duration-200',
                    todayClass
                      ? 'bg-cme-primary text-white ring-2 ring-cme-primary/30'
                      : isCurrentMonth
                      ? 'text-cme-text hover:bg-cme-surface-hover'
                      : 'text-cme-text-muted'
                  )}
                >
                  {day.getDate()}
                </button>

                {/* Platform dots */}
                {dayEvents.length > 0 && !isExpanded && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(platformCounts)
                      .slice(0, 5)
                      .map(([platformId, count]) => {
                        const platform = getPlatformConfig(platformId);
                        return (
                          <div
                            key={platformId}
                            className="flex items-center gap-0.5"
                            title={`${platform.name}: ${count} event${count > 1 ? 's' : ''}`}
                          >
                            <span
                              className={cn('h-1.5 w-1.5 rounded-full', platform.bgClass)}
                            />
                            {count > 1 && (
                              <span className="text-[9px] text-cme-text-muted">{count}</span>
                            )}
                          </div>
                        );
                      })}
                    {Object.keys(platformCounts).length > 5 && (
                      <span className="text-[9px] text-cme-text-muted">
                        +{Object.keys(platformCounts).length - 5}
                      </span>
                    )}
                  </div>
                )}

                {/* Expanded day events */}
                {isExpanded && (
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, maxVisible).map((event) => (
                      <div
                        key={event.id}
                        onDragStart={(e) => onDragStart(e, event)}
                        onDragEnd={onDragEnd}
                      >
                        <EventCard
                          event={event}
                          compact
                          onClick={() => onEventClick(event)}
                          onDragStart={(e) => onDragStart(e, event)}
                        />
                      </div>
                    ))}
                    {dayEvents.length > maxVisible && (
                      <button
                        onClick={() => onEventClick(dayEvents[maxVisible])}
                        className="w-full text-center text-[10px] text-cme-primary hover:text-cme-primary/80 transition-colors"
                      >
                        +{dayEvents.length - maxVisible} more
                      </button>
                    )}
                  </div>
                )}

                {/* Event count badge (non-expanded) */}
                {dayEvents.length > 0 && !isExpanded && (
                  <div className="absolute bottom-1 right-1">
                    <span className="text-[9px] font-mono text-cme-text-muted">
                      {dayEvents.length}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

'use client';

import * as React from 'react';
import {
  X,
  Sparkles,
  Loader2,
  CalendarDays,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPlatformConfig } from '@/components/content/platform-badge';
import { apiClient, ApiClientError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type {
  ContentUploadResponse,
  ContentListResponse,
  CalendarEventsResponse,
  ScheduledEventResponse,
} from '@/types/api';

interface AutoScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ModalStep = 'configure' | 'preview' | 'scheduling' | 'complete';

function AutoScheduleModal({ isOpen, onClose, onSuccess }: AutoScheduleModalProps) {
  const { success: showSuccess, error: showError } = useToast();

  const [step, setStep] = React.useState<ModalStep>('configure');
  const [contentList, setContentList] = React.useState<ContentUploadResponse[]>([]);
  const [selectedContentId, setSelectedContentId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [isLoadingContent, setIsLoadingContent] = React.useState(true);
  const [previewEvents, setPreviewEvents] = React.useState<ScheduledEventResponse[]>([]);
  const [isScheduling, setIsScheduling] = React.useState(false);

  // Load content list
  React.useEffect(() => {
    if (!isOpen) return;

    const loadContent = async () => {
      setIsLoadingContent(true);
      try {
        const response = await apiClient.get<ContentListResponse>(
          '/api/v1/content?status=completed&limit=50'
        );
        setContentList(response.items);
      } catch {
        showError('Failed to load content', 'Could not fetch your content pieces.');
      } finally {
        setIsLoadingContent(false);
      }
    };

    loadContent();
  }, [isOpen, showError]);

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      setStep('configure');
      setSelectedContentId('');
      setStartDate('');
      setPreviewEvents([]);
    }
  }, [isOpen]);

  // Set default start date to tomorrow
  React.useEffect(() => {
    if (isOpen && !startDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const localISO = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
      setStartDate(localISO);
    }
  }, [isOpen, startDate]);

  const handlePreview = async () => {
    if (!selectedContentId || !startDate) {
      showError('Missing fields', 'Please select content and a start date.');
      return;
    }

    setStep('preview');

    try {
      // Call the auto-schedule endpoint in preview/dry-run mode
      const response = await apiClient.post<CalendarEventsResponse>(
        '/api/v1/calendar/auto-schedule',
        {
          content_id: selectedContentId,
          start_date: new Date(startDate).toISOString(),
        }
      );
      setPreviewEvents(response.events);
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Preview failed', err.detail);
      } else {
        showError('Preview failed', 'Could not generate schedule preview.');
      }
      setStep('configure');
    }
  };

  const handleScheduleAll = async () => {
    setStep('scheduling');
    setIsScheduling(true);

    try {
      await apiClient.post<CalendarEventsResponse>(
        '/api/v1/calendar/auto-schedule',
        {
          content_id: selectedContentId,
          start_date: new Date(startDate).toISOString(),
        }
      );

      setStep('complete');
      showSuccess(
        'Schedule created',
        `${previewEvents.length} events have been scheduled.`
      );

      setTimeout(() => {
        onSuccess();
      }, 1200);
    } catch (err) {
      setStep('preview');
      if (err instanceof ApiClientError) {
        showError('Scheduling failed', err.detail);
      } else {
        showError('Scheduling failed', 'An unexpected error occurred.');
      }
    } finally {
      setIsScheduling(false);
    }
  };

  if (!isOpen) return null;

  const selectedContent = contentList.find((c) => c.id === selectedContentId);

  // Group preview events by day
  const eventsByDay = previewEvents.reduce<Record<string, ScheduledEventResponse[]>>(
    (acc, event) => {
      const dayKey = new Date(event.scheduled_at).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      if (!acc[dayKey]) acc[dayKey] = [];
      acc[dayKey].push(event);
      return acc;
    },
    {}
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={step === 'configure' || step === 'preview' ? onClose : undefined}
      />

      {/* Modal */}
      <Card className="relative z-10 mx-4 w-full max-w-lg max-h-[85vh] overflow-hidden border-cme-border shadow-2xl">
        {/* Close button */}
        {(step === 'configure' || step === 'preview') && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {step === 'configure' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cme-secondary" />
                Auto-Schedule Content
              </CardTitle>
              <p className="text-sm text-cme-text-muted">
                Automatically distribute your content across platforms with optimal timing.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoadingContent ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-cme-primary" />
                </div>
              ) : (
                <>
                  {/* Content Selector */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-cme-text">
                      Select Content
                    </label>
                    <select
                      value={selectedContentId}
                      onChange={(e) => setSelectedContentId(e.target.value)}
                      className={cn(
                        'flex h-10 w-full rounded-lg border border-cme-border bg-cme-surface px-3 py-2 text-sm text-cme-text',
                        'transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                        'hover:border-cme-border-bright',
                        'appearance-none cursor-pointer'
                      )}
                    >
                      <option value="">Choose a completed content piece...</option>
                      {contentList.map((content) => (
                        <option key={content.id} value={content.id}>
                          {content.title}
                        </option>
                      ))}
                    </select>
                    {contentList.length === 0 && (
                      <p className="mt-1.5 text-xs text-cme-text-muted">
                        No completed content found. Generate content first.
                      </p>
                    )}
                  </div>

                  {/* Start Date */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-cme-text">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={cn(
                        'flex h-10 w-full rounded-lg border border-cme-border bg-cme-surface px-3 py-2 text-sm text-cme-text',
                        'transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                        'hover:border-cme-border-bright',
                        '[color-scheme:dark]'
                      )}
                    />
                  </div>

                  {/* Selected content preview */}
                  {selectedContent && (
                    <div className="rounded-lg border border-cme-border bg-cme-bg/50 p-3">
                      <p className="text-sm font-medium text-cme-text">
                        {selectedContent.title}
                      </p>
                      <p className="text-xs text-cme-text-muted mt-1">
                        {selectedContent.content_type} &middot; Status: {selectedContent.status}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={onClose} className="flex-1">
                      Cancel
                    </Button>
                    <Button
                      onClick={handlePreview}
                      disabled={!selectedContentId || !startDate}
                      className="flex-1 gap-2"
                    >
                      <CalendarDays className="h-4 w-4" />
                      Preview Schedule
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </>
        )}

        {step === 'preview' && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-cme-secondary" />
                Schedule Preview
              </CardTitle>
              <p className="text-sm text-cme-text-muted">
                {selectedContent?.title || 'Content'} &mdash; {previewEvents.length} platform
                {previewEvents.length !== 1 ? 's' : ''}
              </p>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[50vh] overflow-y-auto">
              {previewEvents.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-cme-primary" />
                </div>
              ) : (
                <>
                  {/* Timeline */}
                  <div className="space-y-3">
                    {Object.entries(eventsByDay).map(([day, dayEvents]) => (
                      <div key={day} className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-2 w-2 rounded-full bg-cme-primary" />
                          <span className="text-xs font-semibold text-cme-text uppercase tracking-wider">
                            {day}
                          </span>
                          <div className="flex-1 h-px bg-cme-border" />
                        </div>
                        <div className="ml-4 space-y-1.5">
                          {dayEvents.map((event) => {
                            const platform = getPlatformConfig(event.platform_id);
                            const time = new Date(event.scheduled_at).toLocaleTimeString(
                              'en-US',
                              { hour: 'numeric', minute: '2-digit', hour12: true }
                            );

                            return (
                              <div
                                key={event.id || `${event.platform_id}-${event.scheduled_at}`}
                                className="flex items-center gap-3 rounded-lg border border-cme-border bg-cme-bg/50 px-3 py-2"
                              >
                                <span
                                  className={cn(
                                    'h-2.5 w-2.5 shrink-0 rounded-full',
                                    platform.bgClass
                                  )}
                                />
                                <span className="text-sm text-cme-text font-medium flex-1">
                                  {platform.name}
                                </span>
                                <ArrowRight className="h-3 w-3 text-cme-text-muted" />
                                <span className="text-xs text-cme-text-muted font-mono">
                                  {time}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setStep('configure')}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleScheduleAll}
                      className="flex-1 gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Schedule All ({previewEvents.length})
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </>
        )}

        {step === 'scheduling' && (
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-8">
              <div className="h-24 w-24 rounded-full border-4 border-cme-surface-hover">
                <div className="absolute inset-0 h-24 w-24 animate-spin rounded-full border-4 border-transparent border-t-cme-secondary" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <CalendarDays className="h-8 w-8 text-cme-secondary animate-pulse" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-cme-text">
              Scheduling Content
            </h3>
            <p className="mt-2 text-sm text-cme-text-muted">
              Creating {previewEvents.length} scheduled events...
            </p>
            <div className="mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-cme-surface-hover">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cme-secondary to-cme-primary animate-pulse"
                style={{ width: '70%' }}
              />
            </div>
          </CardContent>
        )}

        {step === 'complete' && (
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cme-success/20">
              <CheckCircle2 className="h-10 w-10 text-cme-success" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-cme-text">
              Schedule Created!
            </h3>
            <p className="mt-2 text-sm text-cme-text-muted">
              {previewEvents.length} events scheduled successfully.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export { AutoScheduleModal };

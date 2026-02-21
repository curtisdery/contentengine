'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCheck, AlertCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { OutputCard } from '@/components/content/output-card';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiClientError } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import type {
  GeneratedOutputListResponse,
  GeneratedOutputResponse,
  OutputUpdateRequest,
  BulkApproveRequest,
  PlatformProfileResponse,
} from '@/types/api';

type FilterTab = 'all' | 'draft' | 'approved' | 'by_tier';

function OutputsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-20" />
            <div className="flex gap-4">
              <Skeleton variant="circular" className="h-14 w-14" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="w-full" />
                <Skeleton variant="text" className="w-full" />
                <Skeleton variant="text" className="w-3/4" />
              </div>
            </div>
            <Skeleton className="h-px w-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-7 w-14 rounded-lg" />
              <Skeleton className="h-7 w-14 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function OutputsPage() {
  const params = useParams();
  const router = useRouter();
  const { success, error: showError } = useToast();
  const contentId = params.id as string;

  // Data state
  const [outputData, setOutputData] = React.useState<GeneratedOutputListResponse | null>(null);
  const [platforms, setPlatforms] = React.useState<PlatformProfileResponse[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // UI state
  const [activeFilter, setActiveFilter] = React.useState<FilterTab>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [approvingIds, setApprovingIds] = React.useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = React.useState<Set<string>>(new Set());
  const [isBulkApproving, setIsBulkApproving] = React.useState(false);

  // Platform info lookup
  const platformMap = React.useMemo(() => {
    const map = new Map<string, PlatformProfileResponse>();
    for (const p of platforms) {
      map.set(p.platform_id, p);
    }
    return map;
  }, [platforms]);

  // Fetch data
  const fetchOutputs = React.useCallback(async () => {
    try {
      const [outputRes, platformRes] = await Promise.all([
        apiClient.get<GeneratedOutputListResponse>(`/api/v1/generation/${contentId}/outputs`),
        apiClient.get<PlatformProfileResponse[]>('/api/v1/platforms').catch(() => [] as PlatformProfileResponse[]),
      ]);
      setOutputData(outputRes);
      setPlatforms(platformRes);
      setError(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 404) {
          setError('No outputs found for this content. Generate content first.');
        } else {
          setError(err.detail);
        }
      } else {
        setError('Failed to load outputs. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [contentId]);

  React.useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  // Filtered outputs
  const filteredOutputs = React.useMemo(() => {
    if (!outputData) return [];
    const items = outputData.items;

    switch (activeFilter) {
      case 'draft':
        return items.filter((o) => o.status === 'draft');
      case 'approved':
        return items.filter((o) => o.status === 'approved');
      case 'by_tier':
        // Sort by tier (use platform info or fallback)
        return [...items].sort((a, b) => {
          const tierA = platformMap.get(a.platform_id)?.tier ?? 99;
          const tierB = platformMap.get(b.platform_id)?.tier ?? 99;
          return tierA - tierB;
        });
      default:
        return items;
    }
  }, [outputData, activeFilter, platformMap]);

  // Counts
  const totalCount = outputData?.total ?? 0;
  const draftCount = outputData?.items.filter((o) => o.status === 'draft').length ?? 0;
  const approvedCount = outputData?.items.filter((o) => o.status === 'approved').length ?? 0;

  // Selection handlers
  const handleToggleSelect = (id: string) => {
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

  const handleSelectAll = () => {
    if (selectedIds.size === filteredOutputs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOutputs.map((o) => o.id)));
    }
  };

  // Approve single output
  const handleApprove = async (outputId: string) => {
    setApprovingIds((prev) => new Set(prev).add(outputId));
    try {
      const updated = await apiClient.patch<GeneratedOutputResponse>(
        `/api/v1/generation/outputs/${outputId}`,
        { status: 'approved' } as OutputUpdateRequest
      );
      setOutputData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === outputId ? updated : item
          ),
        };
      });
      success('Output approved', 'The output has been marked as approved.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Approval failed', err.detail);
      } else {
        showError('Approval failed', 'Please try again.');
      }
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(outputId);
        return next;
      });
    }
  };

  // Edit output content
  const handleEdit = async (outputId: string, content: string) => {
    setSavingIds((prev) => new Set(prev).add(outputId));
    try {
      const updated = await apiClient.patch<GeneratedOutputResponse>(
        `/api/v1/generation/outputs/${outputId}`,
        { content } as OutputUpdateRequest
      );
      setOutputData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === outputId ? updated : item
          ),
        };
      });
      success('Content saved', 'Your edits have been saved.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Save failed', err.detail);
      } else {
        showError('Save failed', 'Please try again.');
      }
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(outputId);
        return next;
      });
    }
  };

  // Bulk approve
  const handleBulkApprove = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsBulkApproving(true);
    try {
      await apiClient.post<{ approved_count: number }>(
        `/api/v1/generation/${contentId}/outputs/bulk-approve`,
        { output_ids: ids } as BulkApproveRequest
      );
      // Update local state
      setOutputData((prev) => {
        if (!prev) return prev;
        const idSet = new Set(ids);
        return {
          ...prev,
          items: prev.items.map((item) =>
            idSet.has(item.id) ? { ...item, status: 'approved' } : item
          ),
        };
      });
      setSelectedIds(new Set());
      success(
        `${ids.length} output${ids.length > 1 ? 's' : ''} approved`,
        'All selected outputs have been marked as approved.'
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        showError('Bulk approval failed', err.detail);
      } else {
        showError('Bulk approval failed', 'Please try again.');
      }
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleApproveAll = () => {
    const draftIds = (outputData?.items ?? [])
      .filter((o) => o.status === 'draft')
      .map((o) => o.id);
    handleBulkApprove(draftIds);
  };

  const handleApproveSelected = () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const output = outputData?.items.find((o) => o.id === id);
      return output && output.status !== 'approved';
    });
    handleBulkApprove(ids);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        <OutputsSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`${ROUTES.CONTENT_DETAIL}/${contentId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-cme-text">Generated Outputs</h1>
        </div>

        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-12 w-12 text-cme-error" />
          <h2 className="mt-4 text-lg font-semibold text-cme-text">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-cme-text-muted">{error}</p>
          <div className="mt-6 flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push(`${ROUTES.CONTENT_DETAIL}/${contentId}`)}
            >
              Back to Content
            </Button>
            <Button
              onClick={() => {
                setIsLoading(true);
                setError(null);
                fetchOutputs();
              }}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!outputData) return null;

  const selectedDraftCount = Array.from(selectedIds).filter((id) => {
    const o = outputData.items.find((item) => item.id === id);
    return o && o.status !== 'approved';
  }).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`${ROUTES.CONTENT_DETAIL}/${contentId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-cme-text">
              {outputData.content_title}
            </h1>
            <p className="mt-1 text-sm text-cme-text-muted">
              {totalCount} output{totalCount !== 1 ? 's' : ''} generated
            </p>
          </div>
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && selectedDraftCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApproveSelected}
              isLoading={isBulkApproving}
              disabled={isBulkApproving}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Approve Selected ({selectedDraftCount})
            </Button>
          )}
          {draftCount > 0 && (
            <Button
              size="sm"
              onClick={handleApproveAll}
              isLoading={isBulkApproving}
              disabled={isBulkApproving}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Approve All Drafts ({draftCount})
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-cme-border bg-cme-surface/50 p-1">
        {([
          { key: 'all' as FilterTab, label: 'All', count: totalCount },
          { key: 'draft' as FilterTab, label: 'Draft', count: draftCount },
          { key: 'approved' as FilterTab, label: 'Approved', count: approvedCount },
          { key: 'by_tier' as FilterTab, label: 'By Tier', count: null },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary',
              activeFilter === tab.key
                ? 'bg-cme-primary/20 text-cme-primary shadow-sm'
                : 'text-cme-text-muted hover:text-cme-text hover:bg-cme-surface-hover'
            )}
          >
            {tab.key === 'by_tier' && <Filter className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.count !== null && (
              <Badge
                variant={activeFilter === tab.key ? 'default' : 'outline'}
                className="ml-1 text-[10px] px-1.5 py-0"
              >
                {tab.count}
              </Badge>
            )}
          </button>
        ))}

        {/* Select all toggle */}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            className="text-xs"
          >
            {selectedIds.size === filteredOutputs.length && filteredOutputs.length > 0
              ? 'Deselect All'
              : 'Select All'}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {filteredOutputs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-lg font-semibold text-cme-text">
              {activeFilter === 'all'
                ? 'No outputs generated yet'
                : `No ${activeFilter} outputs`}
            </p>
            <p className="mt-2 text-sm text-cme-text-muted">
              {activeFilter === 'all'
                ? 'Go back to the content page and click "Generate Content" to get started.'
                : 'Try changing your filter to see other outputs.'}
            </p>
            {activeFilter !== 'all' && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setActiveFilter('all')}
              >
                Show All Outputs
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Output cards grid */}
      {filteredOutputs.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredOutputs.map((output) => (
            <OutputCard
              key={output.id}
              output={output}
              onApprove={() => handleApprove(output.id)}
              onEdit={(content) => handleEdit(output.id, content)}
              onSelect={() => handleToggleSelect(output.id)}
              isSelected={selectedIds.has(output.id)}
              expanded={expandedId === output.id}
              onToggleExpand={() =>
                setExpandedId((prev) => (prev === output.id ? null : output.id))
              }
              isApproving={approvingIds.has(output.id)}
              isSaving={savingIds.has(output.id)}
              platformInfo={platformMap.get(output.platform_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Loader2, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UploadTabs } from '@/components/content/upload-tabs';
import { FileUpload } from '@/components/content/file-upload';
import { useToast } from '@/hooks/use-toast';
import { callFunction, ApiClientError } from '@/lib/cloud-functions';
import { ROUTES } from '@/lib/constants';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/layout/page-title';
import type { ContentUploadRequest, ContentUploadResponse } from '@/types/api';

type UploadMode = 'paste' | 'file';

export default function ContentUploadPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [uploadMode, setUploadMode] = React.useState<UploadMode>('paste');
  const [analysisStatus, setAnalysisStatus] = React.useState<string | null>(
    null
  );

  const handleUpload = async (data: ContentUploadRequest) => {
    setIsLoading(true);
    setAnalysisStatus('Uploading your content...');

    try {
      // Upload and auto-analyze the content
      const uploadResponse = await callFunction<typeof data, ContentUploadResponse>(
        'createContent', data
      );

      trackEvent('content_upload', { content_type: data.content_type });

      // Redirect to detail page
      router.push(`${ROUTES.CONTENT_DETAIL}/${uploadResponse.id}`);
    } catch (err) {
      setIsLoading(false);
      setAnalysisStatus(null);

      if (err instanceof ApiClientError) {
        showError('Upload failed', err.detail);
      } else {
        showError(
          'Upload failed',
          'An unexpected error occurred. Please try again.'
        );
      }
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="relative mb-6">
              <div className="absolute inset-0 animate-ping">
                <Sparkles className="h-12 w-12 text-cme-primary/30" />
              </div>
              <Loader2 className="h-12 w-12 animate-spin text-cme-primary" />
            </div>
            <h2 className="text-xl font-semibold text-cme-text">
              {analysisStatus}
            </h2>
            <p className="mt-2 text-sm text-cme-text-muted">
              This may take a moment while we extract the DNA from your content.
            </p>
            <div className="mt-8 w-full max-w-md space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/6" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="Upload Content" />
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(ROUTES.CONTENT)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-cme-text">Upload Content</h1>
          <p className="mt-1 text-sm text-cme-text-muted">
            Paste or upload your content to extract its DNA
          </p>
        </div>
      </div>

      {/* Upload mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={uploadMode === 'paste' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUploadMode('paste')}
        >
          <FileText className="mr-2 h-4 w-4" />
          Paste Content
        </Button>
        <Button
          variant={uploadMode === 'file' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setUploadMode('file')}
        >
          <Upload className="mr-2 h-4 w-4" />
          File Upload
        </Button>
      </div>

      {/* Upload Card */}
      <Card className="overflow-hidden">
        {uploadMode === 'paste' ? (
          <UploadTabs onUpload={handleUpload} isLoading={isLoading} />
        ) : (
          <FileUpload onUpload={handleUpload} isLoading={isLoading} />
        )}
      </Card>
    </div>
  );
}

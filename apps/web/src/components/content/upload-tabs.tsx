'use client';

import * as React from 'react';
import { Upload, FileText, Video, Podcast, X, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { ContentUploadRequest } from '@/types/api';

type ContentType = 'blog' | 'video_transcript' | 'podcast_transcript';

interface UploadTabsProps {
  onUpload: (data: ContentUploadRequest) => Promise<void>;
  isLoading: boolean;
}

interface TabConfig {
  id: ContentType;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  { id: 'blog', label: 'Blog / Article', icon: <FileText className="h-4 w-4" /> },
  { id: 'video_transcript', label: 'Video Transcript', icon: <Video className="h-4 w-4" /> },
  { id: 'podcast_transcript', label: 'Podcast Transcript', icon: <Podcast className="h-4 w-4" /> },
];

const ACCEPTED_FILE_TYPES = '.txt,.srt,.vtt';

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function UploadTabs({ onUpload, isLoading }: UploadTabsProps) {
  const [activeTab, setActiveTab] = React.useState<ContentType>('blog');
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [sourceUrl, setSourceUrl] = React.useState('');
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isDragOver, setIsDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setSourceUrl('');
    setFileName(null);
    setErrors({});
  };

  const handleTabChange = (tab: ContentType) => {
    resetForm();
    setActiveTab(tab);
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileSelect = async (file: File) => {
    const validExtensions = ['.txt', '.srt', '.vtt'];
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validExtensions.includes(extension)) {
      setErrors((prev) => ({ ...prev, file: 'Please upload a .txt, .srt, or .vtt file' }));
      return;
    }

    try {
      const fileContent = await readFileContent(file);
      setContent(fileContent);
      setFileName(file.name);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.file;
        delete next.content;
        return next;
      });
    } catch {
      setErrors((prev) => ({ ...prev, file: 'Failed to read file' }));
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const clearFile = () => {
    setFileName(null);
    setContent('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!content.trim()) {
      newErrors.content = 'Content is required. Paste your content or upload a file.';
    }

    if (sourceUrl.trim() && !isValidUrl(sourceUrl.trim())) {
      newErrors.sourceUrl = 'Please enter a valid URL (e.g., https://yourblog.com/post)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data: ContentUploadRequest = {
      title: title.trim(),
      content_type: activeTab,
      raw_content: content.trim(),
    };

    if (sourceUrl.trim()) {
      data.source_url = sourceUrl.trim();
    }

    await onUpload(data);
  };

  const showFileUpload = activeTab === 'video_transcript' || activeTab === 'podcast_transcript';

  return (
    <div>
      {/* Tabs */}
      <div
        className="flex border-b border-cme-border"
        role="tablist"
        aria-label="Content type"
        onKeyDown={(e) => {
          const ids = TABS.map((t) => t.id);
          const idx = ids.indexOf(activeTab);
          let next: number | null = null;
          if (e.key === 'ArrowRight') next = (idx + 1) % ids.length;
          else if (e.key === 'ArrowLeft') next = (idx - 1 + ids.length) % ids.length;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = ids.length - 1;
          if (next !== null) {
            e.preventDefault();
            handleTabChange(ids[next]);
            const el = document.getElementById(`tab-${ids[next]}`);
            el?.focus();
          }
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary focus-visible:ring-inset',
              activeTab === tab.id
                ? 'text-cme-primary'
                : 'text-cme-text-muted hover:text-cme-text'
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cme-primary shadow-[0_0_8px_rgba(108,92,231,0.5)]" />
            )}
          </button>
        ))}
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-6 p-6"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {/* Title */}
        <Input
          label="Title"
          placeholder="Give your content a descriptive title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next.title;
                return next;
              });
            }
          }}
          error={errors.title}
          disabled={isLoading}
        />

        {/* File Upload Zone (Video / Podcast) */}
        {showFileUpload && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-cme-text">
              Upload Transcript
            </label>
            {fileName ? (
              <div className="flex items-center gap-3 rounded-lg border border-cme-border bg-cme-surface p-4">
                <FileText className="h-5 w-5 text-cme-primary" />
                <span className="flex-1 truncate text-sm text-cme-text">
                  {fileName}
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  disabled={isLoading}
                  className="rounded-md p-1 text-cme-text-muted hover:text-cme-error hover:bg-cme-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cme-primary',
                  isDragOver
                    ? 'border-cme-primary bg-cme-primary/5'
                    : 'border-cme-border hover:border-cme-border-bright hover:bg-cme-surface-hover/50',
                  errors.file && 'border-cme-error'
                )}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <Upload
                  className={cn(
                    'mb-3 h-8 w-8',
                    isDragOver ? 'text-cme-primary' : 'text-cme-text-muted'
                  )}
                />
                <p className="text-sm font-medium text-cme-text">
                  Drag & drop or click to upload
                </p>
                <p className="mt-1 text-xs text-cme-text-muted">
                  Supports .txt, .srt, .vtt files
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileInputChange}
              className="hidden"
              aria-label="Upload transcript file"
            />
            {errors.file && (
              <p className="text-xs text-cme-error">{errors.file}</p>
            )}

            {!fileName && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-cme-border" />
                <span className="text-xs text-cme-text-muted">OR</span>
                <div className="h-px flex-1 bg-cme-border" />
              </div>
            )}
          </div>
        )}

        {/* Paste Textarea */}
        {(!showFileUpload || !fileName) && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-cme-text">
              {showFileUpload ? 'Paste transcript' : 'Content'}
            </label>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (errors.content) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.content;
                    return next;
                  });
                }
              }}
              disabled={isLoading}
              placeholder={
                activeTab === 'blog'
                  ? 'Paste your blog post or article content here...'
                  : 'Paste your transcript here...'
              }
              rows={12}
              className={cn(
                'flex w-full rounded-lg border bg-cme-surface px-3 py-3 text-sm text-cme-text placeholder:text-cme-text-muted',
                'transition-all duration-200 resize-y min-h-[200px]',
                'focus:outline-none focus:ring-2 focus:ring-cme-primary/50 focus:border-cme-primary',
                'disabled:cursor-not-allowed disabled:opacity-50',
                errors.content
                  ? 'border-cme-error focus:ring-cme-error/50 focus:border-cme-error'
                  : 'border-cme-border hover:border-cme-border-bright'
              )}
            />
            {errors.content && (
              <p className="mt-1.5 text-xs text-cme-error">{errors.content}</p>
            )}
          </div>
        )}

        {/* YouTube URL (Video tab only) */}
        {activeTab === 'video_transcript' && (
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <label className="text-sm font-medium text-cme-text">
                YouTube URL
              </label>
              <Badge variant="outline">Coming Soon</Badge>
            </div>
            <Input
              placeholder="https://youtube.com/watch?v=..."
              prefixIcon={<LinkIcon className="h-4 w-4" />}
              disabled
              className="opacity-50"
            />
          </div>
        )}

        {/* Source URL (Blog tab only) */}
        {activeTab === 'blog' && (
          <Input
            label="Source URL (optional)"
            placeholder="https://yourblog.com/post-title"
            prefixIcon={<LinkIcon className="h-4 w-4" />}
            value={sourceUrl}
            onChange={(e) => {
              setSourceUrl(e.target.value);
              if (errors.sourceUrl) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.sourceUrl;
                  return next;
                });
              }
            }}
            error={errors.sourceUrl}
            disabled={isLoading}
          />
        )}

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            size="lg"
            isLoading={isLoading}
            disabled={isLoading}
          >
            Analyze Content
          </Button>
        </div>
      </form>
    </div>
  );
}

export { UploadTabs };

'use client';

import * as React from 'react';
import { Upload, FileText, X, CheckCircle } from 'lucide-react';
import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContentUploadRequest } from '@/types/api';

type ContentType = 'blog' | 'video_transcript' | 'podcast_transcript';

interface FileUploadProps {
  onUpload: (data: ContentUploadRequest) => Promise<void>;
  isLoading: boolean;
}

function FileUpload({ onUpload, isLoading }: FileUploadProps) {
  const [title, setTitle] = React.useState('');
  const [contentType, setContentType] = React.useState<ContentType>('blog');
  const [file, setFile] = React.useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const [storagePath, setStoragePath] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const uploadTaskRef = React.useRef<UploadTask | null>(null);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setStoragePath(null);
    setUploadProgress(null);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.file;
      return next;
    });

    // Auto-fill title from filename if empty
    if (!title.trim()) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^.]+$/, '');
      setTitle(nameWithoutExt);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileSelect(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const clearFile = () => {
    if (uploadTaskRef.current) {
      uploadTaskRef.current.cancel();
      uploadTaskRef.current = null;
    }
    setFile(null);
    setStoragePath(null);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadToStorage = async (): Promise<string> => {
    if (!file) throw new Error('No file selected');

    const uniqueId = crypto.randomUUID().slice(0, 12);
    const path = `uploads/${uniqueId}/${file.name}`;
    const storageRef = ref(storage, path);

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      uploadTaskRef.current = task;

      task.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          setUploadProgress(progress);
        },
        (error) => {
          uploadTaskRef.current = null;
          reject(error);
        },
        () => {
          uploadTaskRef.current = null;
          setStoragePath(path);
          resolve(path);
        }
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!file) newErrors.file = 'Please select a file to upload';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      // Upload to Firebase Storage if not already uploaded
      let path = storagePath;
      if (!path) {
        path = await uploadToStorage();
      }

      // Send to backend
      await onUpload({
        title: title.trim(),
        content_type: contentType,
        storage_path: path,
      });
    } catch {
      setErrors({ file: 'Upload failed. Please try again.' });
      setUploadProgress(null);
    }
  };

  const isUploading = uploadProgress !== null && uploadProgress < 100;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6">
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
        disabled={isLoading || isUploading}
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-cme-text">
          Content Type
        </label>
        <div className="flex gap-2">
          {(['blog', 'video_transcript', 'podcast_transcript'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setContentType(type)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                contentType === type
                  ? 'border-cme-primary bg-cme-primary/10 text-cme-primary'
                  : 'border-cme-border text-cme-text-muted hover:border-cme-border-bright hover:text-cme-text'
              )}
            >
              {type === 'blog' ? 'Blog / Article' : type === 'video_transcript' ? 'Video' : 'Podcast'}
            </button>
          ))}
        </div>
      </div>

      {/* File drop zone */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-cme-text">
          Upload File
        </label>
        {file ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-cme-border bg-cme-surface p-4">
              {storagePath ? (
                <CheckCircle className="h-5 w-5 text-cme-success" />
              ) : (
                <FileText className="h-5 w-5 text-cme-primary" />
              )}
              <span className="flex-1 truncate text-sm text-cme-text">
                {file.name}
              </span>
              <span className="text-xs text-cme-text-muted">
                {(file.size / 1024).toFixed(1)} KB
              </span>
              <button
                type="button"
                onClick={clearFile}
                disabled={isLoading}
                className="rounded-md p-1 text-cme-text-muted hover:text-cme-error hover:bg-cme-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress bar */}
            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-cme-surface-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cme-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-cme-text-muted text-right">
                  {uploadProgress === 100 ? 'Upload complete' : `${uploadProgress}%`}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-all duration-200',
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
              Any file type supported
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileInputChange}
          className="hidden"
          aria-label="Upload file"
        />
        {errors.file && (
          <p className="text-xs text-cme-error">{errors.file}</p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          size="lg"
          isLoading={isLoading || isUploading}
          disabled={isLoading || isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload & Analyze'}
        </Button>
      </div>
    </form>
  );
}

export { FileUpload };

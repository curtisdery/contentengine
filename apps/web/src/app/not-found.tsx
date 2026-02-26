import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cme-bg px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold gradient-text">404</p>
        <h1 className="mt-4 text-2xl font-bold text-cme-text">
          Page not found
        </h1>
        <p className="mt-2 text-cme-text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-cme-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-cme-primary/90 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

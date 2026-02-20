import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api';

interface OAuthAuthorizeResponse {
  authorize_url: string;
}

interface OAuthResult {
  status: string;
  platform: string;
  username?: string;
  error?: string;
}

export function useOAuthPopup() {
  const [isConnecting, setIsConnecting] = useState(false);

  const startOAuth = useCallback(
    (platformId: string): Promise<OAuthResult> => {
      setIsConnecting(true);

      return new Promise<OAuthResult>(async (resolve, reject) => {
        try {
          const { authorize_url } = await apiClient.get<OAuthAuthorizeResponse>(
            `/api/v1/connections/${platformId}/authorize`
          );

          // Open centered popup
          const width = 600;
          const height = 700;
          const left = window.screenX + (window.outerWidth - width) / 2;
          const top = window.screenY + (window.outerHeight - height) / 2;
          const features = `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`;

          const popup = window.open(authorize_url, 'oauth_popup', features);

          if (!popup) {
            setIsConnecting(false);
            reject(new Error('Popup was blocked. Please allow popups for this site.'));
            return;
          }

          // Listen for the postMessage from the callback page
          const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'OAUTH_CALLBACK') return;

            window.removeEventListener('message', handleMessage);
            clearInterval(pollTimer);
            setIsConnecting(false);

            try {
              popup.close();
            } catch {
              // popup may already be closed
            }

            resolve({
              status: event.data.status,
              platform: event.data.platform,
              username: event.data.username,
              error: event.data.error,
            });
          };

          window.addEventListener('message', handleMessage);

          // Poll to detect if popup was closed manually
          const pollTimer = setInterval(() => {
            if (popup.closed) {
              clearInterval(pollTimer);
              window.removeEventListener('message', handleMessage);
              setIsConnecting(false);
              reject(new Error('OAuth popup was closed before completing.'));
            }
          }, 500);
        } catch (err) {
          setIsConnecting(false);
          reject(err);
        }
      });
    },
    []
  );

  return { startOAuth, isConnecting };
}

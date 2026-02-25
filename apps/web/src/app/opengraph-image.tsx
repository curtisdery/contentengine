import { ImageResponse } from 'next/og';

export const alt = 'Pandocast — Upload once. Pando everywhere.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          position: 'relative',
        }}
      >
        {/* Background gradient orbs */}
        <div
          style={{
            position: 'absolute',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(108,92,231,0.3), transparent 60%)',
            top: -100,
            left: -100,
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,206,201,0.2), transparent 60%)',
            bottom: -100,
            right: -50,
            filter: 'blur(80px)',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            position: 'relative',
          }}
        >
          {/* PANDO wordmark */}
          <span
            style={{
              fontSize: 140,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              background: 'linear-gradient(135deg, #00cec9 0%, #6c5ce7 40%, #a855f7 100%)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            PANDO
          </span>

          {/* Tagline */}
          <span
            style={{
              fontSize: 32,
              fontWeight: 500,
              color: '#a0a0c0',
              letterSpacing: '0.02em',
            }}
          >
            Upload once. Pando everywhere.
          </span>

          {/* Descriptor */}
          <span
            style={{
              fontSize: 20,
              fontWeight: 400,
              color: '#6b6b8a',
              marginTop: 8,
            }}
          >
            One upload → 18 platform-native posts in your voice
          </span>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.1em',
              background: 'linear-gradient(135deg, #6c5ce7, #00cec9)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            PANDOCAST
          </span>
          <span style={{ fontSize: 18, color: '#4a4a6a' }}>·</span>
          <span style={{ fontSize: 16, color: '#6b6b8a' }}>pandocast.ai</span>
        </div>
      </div>
    ),
    { ...size }
  );
}

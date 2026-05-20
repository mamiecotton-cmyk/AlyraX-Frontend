'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Archetype } from '@/lib/archetypes';

type Props = {
  archetype: Archetype;
  featured?: boolean;
  delay?: number;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

export default function ArchetypeCard({
  archetype,
  featured = false,
  delay = 0,
  imageUrl,
  videoUrl,
}: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    const video = videoRef.current;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    const tryPlay = () => {
      video.play().catch(() => setVideoError(true));
    };

    if (video.readyState >= 3) {
      setVideoReady(true);
      tryPlay();
    } else {
      video.addEventListener('canplay', () => {
        setVideoReady(true);
        tryPlay();
      }, { once: true });
      video.addEventListener('error', () => setVideoError(true), { once: true });
    }
  }, [videoUrl]);

  const showVideo = videoUrl && !videoError;
  const isWebp = videoUrl?.includes('.webp');

  return (
    <article
      className="card-hover fade-in"
      style={{
        animationDelay: `${delay}s`,
        background: '#1a1a1a',
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        border: featured ? '2px solid #e63946' : '1px solid #2a2a2a',
      }}
      onClick={() => router.push(`/dossier/${archetype.id}`)}
    >
      <div
        style={{
          aspectRatio: '3/4',
          background: archetype.imageGradient,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Static image base layer */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt={archetype.name}
            loading="lazy"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center top',
              display: 'block',
              transition: 'opacity 0.4s ease',
              opacity: showVideo && videoReady ? 0 : 1,
            }}
          />
        )}

        {/* Placeholder silhouette */}
        {!imageUrl && !showVideo && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="48" height="80" viewBox="0 0 48 80" fill="none" aria-hidden="true">
              <circle cx="24" cy="20" r="12" fill="#ffffff" opacity="0.1" />
              <path d="M6 72 C6 52 42 52 42 72" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.1" />
            </svg>
          </div>
        )}

        {/* Video layer */}
        {showVideo && (
          <>
            {isWebp ? (
              <img
                src={videoUrl!}
                alt={archetype.name}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center top',
                  display: 'block',
                  opacity: videoReady ? 1 : 0,
                  transition: 'opacity 0.4s ease',
                }}
                onLoad={() => setVideoReady(true)}
                onError={() => setVideoError(true)}
              />
            ) : (
              <video
                ref={videoRef}
                src={videoUrl!}
                muted
                loop
                playsInline
                autoPlay
                preload="auto"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center top',
                  display: 'block',
                  opacity: videoReady ? 1 : 0,
                  transition: 'opacity 0.4s ease',
                }}
              />
            )}
            {isWebp && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', animation: 'loopFade 5s ease-in-out infinite' }} />
            )}
          </>
        )}

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.95) 100%)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {featured && (
          <div style={{ position: 'absolute', top: '12px', right: '12px', background: '#e63946', color: '#ffffff', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '20px', zIndex: 2 }}>
            ● Your Match
          </div>
        )}

        <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.14em', padding: '3px 8px', borderRadius: '3px', zIndex: 2 }}>
          {archetype.dossierId}
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 14px 14px', zIndex: 2 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#e63946', color: '#ffffff', fontSize: '10px', fontWeight: 500, padding: '3px 9px', borderRadius: '20px', marginBottom: '8px' }}>
            <span style={{ fontSize: '7px' }}>●</span> Online
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 500, color: '#ffffff', lineHeight: 1.1, marginBottom: '4px' }}>
            {archetype.name}
          </div>
          <div style={{ fontSize: '12px', color: '#ffffff', opacity: 0.85, marginBottom: '2px' }}>{archetype.city}</div>
          <div style={{ fontSize: '12px', color: '#ffffff', opacity: 0.7 }}>{archetype.age} years old</div>
        </div>
      </div>

      <style>{`
        @keyframes loopFade {
          0%   { opacity: 0; background: transparent; }
          80%  { opacity: 0; background: transparent; }
          90%  { opacity: 1; background: rgba(0,0,0,0.6); }
          95%  { opacity: 1; background: rgba(0,0,0,0.6); }
          100% { opacity: 0; background: transparent; }
        }
      `}</style>
    </article>
  );
}
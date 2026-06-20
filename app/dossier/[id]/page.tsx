'use client';

import { type CSSProperties, use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { archetypes } from '../../../lib/archetypes';

type Props = {
  params: Promise<{ id: string }>;
};

type GalleryImage = {
  id: string;
  image_url: string;
  is_main: boolean;
};

export default function DossierPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const archetype = archetypes.find((a) => a.id === id);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [archetypeImage, setArchetypeImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [addedToCollection, setAddedToCollection] = useState(false);

  useEffect(() => {
    fetch('/api/archetypes/images')
      .then((r) => r.json())
      .then(({ images }) => setArchetypeImage(images?.[id] || null))
      .catch(() => {});

    fetch(`/api/archetypes/gallery?archetype_id=${id}`)
      .then((r) => r.json())
      .then(({ images }) => {
        if (images?.length) setGalleryImages(images);
      })
      .catch(() => {});
  }, [id]);

  const carouselImages = useMemo(() => {
    const images = galleryImages.length
      ? [...galleryImages].sort((a, b) => Number(b.is_main) - Number(a.is_main))
      : [];

    if (!images.length && archetypeImage) {
      return [{ id: 'main', image_url: archetypeImage, is_main: true }];
    }

    return images;
  }, [archetypeImage, galleryImages]);

  if (!archetype) {
    return (
      <div className="dossier-shell dossier-shell-empty">
        <div style={{ textAlign: 'center' }}>
          <div className="dossier-kicker" style={{ marginBottom: '14px' }}>
            Dossier Not Found
          </div>
          <button onClick={() => router.push('/archive')} className="dossier-text-button">
            Return to Archive
          </button>
        </div>
      </div>
    );
  }

  const safeActiveImageIndex = carouselImages.length
    ? Math.min(activeImageIndex, carouselImages.length - 1)
    : 0;
  const activeImage = carouselImages[safeActiveImageIndex] || carouselImages[0];
  const portraitUrl = activeImage?.image_url || archetypeImage;
  const matchScore = Math.round(
    ((archetype.vector[0] + archetype.vector[1] + archetype.vector[2]) / 3) * 100,
  );

  async function ensureCompanion() {
    const res = await fetch('/api/companion/create-from-archetype', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archetypeId: id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add companion');
    setAddedToCollection(true);
    return data as { companion_id?: string; voice_id?: string | null };
  }

  async function handleAddToCollection() {
    setAddingToCollection(true);
    try {
      await ensureCompanion();
      setTimeout(() => router.push(`/chat/${id}?returnTo=${encodeURIComponent(`/dossier/${id}`)}`), 800);
    } catch (err) {
      console.error('Failed to add companion:', err);
    } finally {
      setAddingToCollection(false);
    }
  }

  async function handleStartChat() {
    setAddingToCollection(true);
    try {
      await ensureCompanion();
      router.push(`/chat/${id}?returnTo=${encodeURIComponent(`/dossier/${id}`)}`);
    } catch (err) {
      console.error('Failed to start chat:', err);
    } finally {
      setAddingToCollection(false);
    }
  }

  async function handleStartCall() {
    setAddingToCollection(true);
    try {
      await ensureCompanion();
      router.push(`/chat/${id}?call=1&returnTo=${encodeURIComponent(`/dossier/${id}`)}`);
    } catch (err) {
      console.error('Failed to start call:', err);
    } finally {
      setAddingToCollection(false);
    }
  }

  const actions = [
    { label: addingToCollection ? 'Opening...' : 'Chat', accent: '#a782ff', onClick: handleStartChat, icon: 'chat' },
    { label: 'Group Chat', accent: '#20c7ff', onClick: () => router.push('/dashboard'), icon: 'group' },
    {
      label: addedToCollection ? 'Added ✓' : addingToCollection ? 'Adding...' : 'Add to Collection',
      accent: addedToCollection ? '#27ae60' : '#ffd43b',
      onClick: handleAddToCollection,
      icon: 'spark',
    },
    { label: addingToCollection ? 'Opening...' : 'Call', accent: '#16d8a3', onClick: handleStartCall, icon: 'call' },
  ];

  return (
    <div className="dossier-shell">
      <style>{`
        html,
        body {
          background: #050505;
          height: auto !important;
          min-height: 100%;
        }

        .dossier-shell {
          min-height: 100dvh;
          width: 100%;
          position: relative;
          overflow: hidden;
          background: #030303;
          color: #f7f4ee;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 32px;
        }

        .dossier-shell-empty {
          background: #050505;
        }

        .dossier-backdrop {
          position: absolute;
          inset: -36px;
          background: var(--profile-bg);
          background-size: cover;
          background-position: center;
          filter: blur(26px);
          transform: scale(1.08);
          opacity: 0.42;
        }

        .dossier-vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 50% 38%, rgba(255,255,255,0.08), transparent 28%),
            linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.35) 44%, rgba(0,0,0,0.72)),
            rgba(0,0,0,0.58);
        }

        .dossier-topline {
          position: absolute;
          top: 24px;
          left: 32px;
          right: 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 3;
          pointer-events: none;
        }

        .dossier-brand {
          font-family: var(--font-display);
          font-size: 22px;
          letter-spacing: 0;
          color: #fff;
        }

        .dossier-brand span {
          display: block;
          margin-top: 4px;
          font-family: var(--font-body);
          font-size: 10px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.62);
        }

        .dossier-text-button {
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(0,0,0,0.42);
          color: #fff;
          border-radius: 999px;
          padding: 10px 15px;
          font: 700 12px var(--font-body);
          cursor: pointer;
          pointer-events: auto;
        }

        .dossier-card {
          position: relative;
          z-index: 2;
          width: min(1100px, calc(100vw - 64px));
          height: min(600px, calc(100dvh - 92px));
          min-height: 520px;
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(360px, 0.95fr);
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.14);
          background: #070707;
          box-shadow: 0 28px 90px rgba(0,0,0,0.62);
        }

        .dossier-media {
          position: relative;
          min-width: 0;
          overflow: hidden;
          background: ${archetype.imageGradient};
        }

        .dossier-media::before {
          content: "";
          position: absolute;
          inset: -24px;
          background: var(--dossier-media-bg, ${archetype.imageGradient});
          background-size: cover;
          background-position: center;
          filter: blur(18px);
          transform: scale(1.04);
          opacity: 0.54;
        }

        .dossier-media img {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center center;
          display: block;
        }

        .dossier-media-fallback {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.58);
          font-family: var(--font-display);
          font-size: clamp(54px, 12vw, 140px);
        }

        .dossier-media::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 2;
          background:
            linear-gradient(90deg, transparent 56%, rgba(0,0,0,0.38)),
            linear-gradient(180deg, transparent 58%, rgba(0,0,0,0.54));
          pointer-events: none;
        }

        .dossier-dots {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 16px;
          z-index: 3;
          display: flex;
          justify-content: center;
          gap: 7px;
        }

        .dossier-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          border: 0;
          background: rgba(255,255,255,0.38);
          cursor: pointer;
          padding: 0;
        }

        .dossier-dot-active {
          width: 18px;
          background: #fff;
        }

        .dossier-panel {
          position: relative;
          background: #080808;
          padding: 34px 40px 32px;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .dossier-panel-actions {
          position: absolute;
          top: 18px;
          right: 18px;
          display: flex;
          gap: 8px;
        }

        .dossier-icon-button {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .dossier-name-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-right: 82px;
          margin-top: 8px;
        }

        .dossier-name {
          font-family: var(--font-display);
          font-size: clamp(36px, 4vw, 48px);
          line-height: 0.92;
          color: #fff;
          letter-spacing: 0;
        }

        .dossier-audio {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid #8d64ff;
          background: rgba(141,100,255,0.09);
          color: #fff;
          cursor: pointer;
          font: 800 16px var(--font-body);
        }

        .dossier-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 16px;
          color: #9aa0ad;
          font-size: 15px;
          line-height: 1.35;
        }

        .dossier-meta span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .dossier-copy {
          margin: 14px 0 0;
          color: #f0f0f0;
          font-size: 16px;
          line-height: 1.48;
          max-width: 420px;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .dossier-social {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: center;
          padding: 16px 0 14px;
          color: #9aa0ad;
          font-size: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .dossier-section-title {
          margin: 16px 0 6px;
          color: #fff;
          font-size: 15px;
          font-weight: 800;
        }

        .dossier-helper {
          color: #7f8796;
          font-size: 13px;
          line-height: 1.35;
          margin-bottom: 14px;
        }

        .dossier-action-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: auto;
        }

        .dossier-action {
          min-height: 84px;
          border: 0;
          border-radius: 12px;
          background: #1a1a1a;
          color: #fff;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font: 800 14px var(--font-body);
        }

        .dossier-action:hover,
        .dossier-icon-button:hover,
        .dossier-text-button:hover {
          filter: brightness(1.12);
        }

        .dossier-action-icon {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--action-accent);
        }

        .dossier-action-icon svg,
        .dossier-inline-icon {
          width: 24px;
          height: 24px;
          stroke: currentColor;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }

        .dossier-audio svg {
          width: 20px;
          height: 20px;
          stroke: currentColor;
          stroke-width: 2.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }

        .dossier-kicker {
          font-family: var(--font-body);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: #ef3f51;
        }

        @media (max-width: 920px) {
          .dossier-shell {
            align-items: flex-start;
            display: block;
            padding: 76px 16px 24px;
            overflow: visible;
          }

          .dossier-backdrop {
            position: fixed;
            inset: -20px;
            filter: blur(20px);
            transform: scale(1.06);
            opacity: 0.28;
          }

          .dossier-vignette {
            position: fixed;
            background:
              linear-gradient(180deg, rgba(0,0,0,0.46), rgba(0,0,0,0.74) 42%, #050505 100%),
              rgba(0,0,0,0.36);
          }

          .dossier-card {
            width: min(560px, 100%);
            height: auto;
            min-height: 0;
            grid-template-columns: 1fr;
            margin: 0 auto;
            border-radius: 18px;
            overflow: visible;
            border-color: rgba(255,255,255,0.1);
            background: rgba(8,8,8,0.96);
          }

          .dossier-media {
            aspect-ratio: 4 / 5;
            overflow: hidden;
            border-radius: 18px 18px 0 0;
          }

          .dossier-media::after {
            background:
              linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.68) 100%);
          }

          .dossier-panel {
            padding: 24px 22px 22px;
          }

          .dossier-panel-actions {
            top: -52px;
            right: 14px;
          }

          .dossier-name-row {
            align-items: flex-start;
            padding-right: 0;
            margin-top: 0;
          }

          .dossier-name {
            font-size: clamp(36px, 12vw, 48px);
            line-height: 0.96;
          }

          .dossier-audio {
            flex: 0 0 auto;
            width: 38px;
            height: 38px;
          }

          .dossier-copy {
            max-width: none;
            -webkit-line-clamp: unset;
          }

          .dossier-action-grid {
            margin-top: 6px;
          }
        }

        @media (max-width: 560px) {
          .dossier-shell {
            min-height: 100dvh;
            padding: 68px 0 0;
            background: #050505;
          }

          .dossier-topline {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 58px;
            padding: 10px 14px;
            background: rgba(5,5,5,0.84);
            backdrop-filter: blur(14px);
            border-bottom: 1px solid rgba(255,255,255,0.08);
          }

          .dossier-brand {
            font-size: 18px;
          }

          .dossier-brand span {
            font-size: 8px;
            letter-spacing: 0.2em;
          }

          .dossier-text-button {
            padding: 8px 12px;
            font-size: 11px;
          }

          .dossier-card {
            width: 100%;
            border-radius: 0;
            border: 0;
            box-shadow: none;
            background: #080808;
          }

          .dossier-media {
            aspect-ratio: auto;
            height: min(68dvh, 560px);
            min-height: 420px;
            border-radius: 0;
          }

          .dossier-media img {
            object-position: center center;
          }

          .dossier-dots {
            bottom: 14px;
          }

          .dossier-panel {
            margin-top: -34px;
            padding: 24px 18px 22px;
            border-radius: 22px 22px 0 0;
            background: #080808;
          }

          .dossier-name {
            font-size: clamp(34px, 11vw, 42px);
          }

          .dossier-meta {
            gap: 8px;
            margin-top: 12px;
            font-size: 13px;
          }

          .dossier-meta span,
          .dossier-social span {
            padding: 5px 8px;
            border-radius: 999px;
            background: rgba(255,255,255,0.06);
          }

          .dossier-copy {
            font-size: 15px;
            line-height: 1.5;
            margin-top: 12px;
          }

          .dossier-social {
            gap: 8px;
            padding: 14px 0;
            font-size: 12px;
          }

          .dossier-helper {
            display: none;
          }

          .dossier-action-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }

          .dossier-action {
            min-height: 68px;
            border-radius: 10px;
            gap: 5px;
            font-size: 13px;
          }

          .dossier-action-icon {
            width: 24px;
            height: 24px;
          }

          .dossier-action-icon svg {
            width: 21px;
            height: 21px;
          }
        }
      `}</style>

      <div
        className="dossier-backdrop"
        style={{
          '--profile-bg': portraitUrl
            ? `linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url(${portraitUrl})`
            : archetype.imageGradient,
        } as CSSProperties}
      />
      <div className="dossier-vignette" />

      <div className="dossier-topline">
        <div className="dossier-brand">
          ALYRA X
          <span>Private Archive</span>
        </div>
        <button onClick={() => router.push('/archive')} className="dossier-text-button">
          Back to Archive
        </button>
      </div>

      <section className="dossier-card" aria-label={`${archetype.name} profile`}>
        <div
          className="dossier-media"
          style={{
            '--dossier-media-bg': portraitUrl ? `url(${portraitUrl})` : archetype.imageGradient,
          } as CSSProperties}
        >
          {portraitUrl ? (
            <img src={portraitUrl} alt={archetype.name} />
          ) : (
            <div className="dossier-media-fallback">{archetype.name[0]}</div>
          )}

          {carouselImages.length > 1 && (
            <div className="dossier-dots" aria-label="Gallery images">
              {carouselImages.slice(0, 10).map((image, index) => (
                <button
                  key={image.id}
                  className={`dossier-dot ${index === safeActiveImageIndex ? 'dossier-dot-active' : ''}`}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`Show image ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="dossier-panel">
          <div className="dossier-panel-actions">
            <button className="dossier-icon-button" aria-label="Share profile">
              <svg className="dossier-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 10.7l6.8-4.4M8.6 13.3l6.8 4.4" />
              </svg>
            </button>
            <button className="dossier-icon-button" onClick={() => router.push('/archive')} aria-label="Close profile">
              <span aria-hidden="true">x</span>
            </button>
          </div>

          <div className="dossier-name-row">
            <h1 className="dossier-name">{archetype.name}</h1>
            <button className="dossier-audio" aria-label={`Play ${archetype.name} voice preview`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 10v4h4l5 4V6l-5 4H5z" />
                <path d="M17 9.5a4 4 0 010 5" />
                <path d="M19.5 7a7.5 7.5 0 010 10" />
              </svg>
            </button>
          </div>

          <div className="dossier-meta" aria-label="Profile details">
            <span>{archetype.age} years</span>
            <span>{archetype.city}</span>
            <span>{archetype.archetype}</span>
          </div>

          <p className="dossier-copy">{archetype.bio || archetype.quote}</p>

          <div className="dossier-social">
            <span>{matchScore}% match</span>
            <span>{galleryImages.length || 1} images</span>
            <span>{archetype.dossierId}</span>
            <span>Profile</span>
          </div>

          <div className="dossier-section-title">Start here</div>
          <div className="dossier-helper">
            Jump into a chat, create a group, generate new content, or start a private call with {archetype.name}.
          </div>

          <div className="dossier-action-grid">
            {actions.map((action) => (
              <button
                key={`${action.icon}-${action.label}`}
                className="dossier-action"
                onClick={action.onClick}
                style={{ '--action-accent': action.accent } as CSSProperties}
              >
                <span className="dossier-action-icon" aria-hidden="true">
                  {action.icon === 'chat' && (
                    <svg viewBox="0 0 24 24">
                      <path d="M21 11.5a8.5 8.5 0 01-9 8.5 9.7 9.7 0 01-4.4-1.1L3 20l1.2-4.2A8.2 8.2 0 013 11.5 8.5 8.5 0 0112 3a8.5 8.5 0 019 8.5z" />
                    </svg>
                  )}
                  {action.icon === 'group' && (
                    <svg viewBox="0 0 24 24">
                      <circle cx="9" cy="8" r="3" />
                      <circle cx="17" cy="10" r="2.5" />
                      <path d="M3.5 19a5.5 5.5 0 0111 0" />
                      <path d="M14 15.5a4.6 4.6 0 016.5 3.5" />
                    </svg>
                  )}
                  {action.icon === 'spark' && (
                    <svg viewBox="0 0 24 24">
                      <path d="M12 2l1.7 5.2L19 9l-5.3 1.8L12 16l-1.7-5.2L5 9l5.3-1.8L12 2z" />
                      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
                    </svg>
                  )}
                  {action.icon === 'call' && (
                    <svg viewBox="0 0 24 24">
                      <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 2 .7 2.9a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.2-1.2a2 2 0 012.1-.5c.9.3 1.9.6 2.9.7A2 2 0 0122 16.9z" />
                    </svg>
                  )}
                </span>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

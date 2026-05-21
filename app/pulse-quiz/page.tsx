'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { quizAnswersToVector, matchArchetypes } from '@/lib/matchmaking';
import type { PersonalityVector } from '@/lib/matchmaking';
import Sidebar from '@/components/Sidebar';

type Question = {
  id: number;
  text: string;
  dimension: string;
  options: { label: string; value: number; sub: string }[];
};

const QUESTIONS: Question[] = [
  {
    id: 1,
    text: 'What draws you in first?',
    dimension: 'intensity',
    options: [
      { label: 'Stillness',        value: 0, sub: 'The quiet ones hit different.' },
      { label: 'Measured energy',  value: 1, sub: 'Present without overwhelming.' },
      { label: 'Magnetic pull',    value: 2, sub: "Can't look away." },
      { label: 'Electric charge',  value: 3, sub: 'Every room feels them enter.' },
      { label: 'Pure fire',        value: 4, sub: 'Intensity as a love language.' },
    ],
  },
  {
    id: 2,
    text: 'What kind of love feels like safety?',
    dimension: 'warmth',
    options: [
      { label: 'Space and respect',  value: 0, sub: 'Independence honors both of us.' },
      { label: 'Soft consistency',   value: 1, sub: 'There when it counts.' },
      { label: 'Warm reciprocity',   value: 2, sub: 'We pour into each other.' },
      { label: 'Deep presence',      value: 3, sub: 'All of them, all of the time.' },
      { label: 'Complete devotion',  value: 4, sub: 'Wrapped up, held tight, home.' },
    ],
  },
  {
    id: 3,
    text: 'What moves you in a conversation?',
    dimension: 'intellect',
    options: [
      { label: 'Gut and instinct',    value: 0, sub: 'Feel it before you think it.' },
      { label: 'Storytelling',        value: 1, sub: 'How they hold a moment.' },
      { label: 'Sharp perspective',   value: 2, sub: 'A mind that cuts clean.' },
      { label: 'Deep frameworks',     value: 3, sub: 'How they think about thinking.' },
      { label: 'Pure intellect',      value: 4, sub: 'Leave you building new thoughts.' },
    ],
  },
  {
    id: 4,
    text: 'What world do they come from?',
    dimension: 'street',
    options: [
      { label: 'Polished and refined',  value: 0, sub: 'Board rooms and black cards.' },
      { label: 'Academic circles',      value: 1, sub: 'Books and theory and purpose.' },
      { label: 'Creative underground',  value: 2, sub: 'Art, music, the scene.' },
      { label: 'Self-made grind',       value: 3, sub: 'Built it from the ground up.' },
      { label: 'Streets shaped them',   value: 4, sub: 'Every scar has a story.' },
    ],
  },
  {
    id: 5,
    text: 'What energy do you want them to carry?',
    dimension: 'dominance',
    options: [
      { label: 'Gentle and yielding',   value: 0, sub: 'Soft hands, open heart.' },
      { label: 'Collaborative',         value: 1, sub: 'We decide together.' },
      { label: 'Confident presence',    value: 2, sub: 'Holds their own, honors mine.' },
      { label: 'Commanding',            value: 3, sub: 'Takes charge, takes care.' },
      { label: 'Dominant force',        value: 4, sub: 'Protection through power.' },
    ],
  },
];

export default function PulseQuizPage() {
  const router = useRouter();
  const [step, setStep]       = useState<'gender' | 'quiz' | 'result'>('gender');
  const [gender, setGender]   = useState<'M' | 'F' | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [matches, setMatches] = useState<ReturnType<typeof matchArchetypes>>([]);
  const [adding, setAdding]   = useState<string | null>(null);
  const [added, setAdded]     = useState<Set<string>>(new Set());

  function handleGender(g: 'M' | 'F') {
    setGender(g);
    setStep('quiz');
  }

  function handleAnswer(value: number) {
    const next = [...answers, value];
    setAnswers(next);

    if (next.length === QUESTIONS.length) {
      const vec = quizAnswersToVector(next as [number, number, number, number, number]);
      const results = matchArchetypes(vec as PersonalityVector, gender ?? undefined);
      setMatches(results.slice(0, 5));
      setStep('result');
    } else {
      setCurrent(current + 1);
    }
  }

  function handleBack() {
    if (current === 0) { setStep('gender'); setAnswers([]); return; }
    setAnswers(answers.slice(0, -1));
    setCurrent(current - 1);
  }

  async function handleAddToCollection(archetypeId: string) {
    setAdding(archetypeId);
    try {
      const res = await fetch('/api/companion/create-from-archetype', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetypeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAdded(prev => new Set([...prev, archetypeId]));
    } catch (err) {
      console.error('Failed to add companion:', err);
    }
    setAdding(null);
  }

  const progress = step === 'quiz' ? ((current) / QUESTIONS.length) * 100 : 0;

  return (
    <div className="app-shell theme-dark" style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar />

      <main
        className="app-main"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          overflow: 'hidden',
          background: 'var(--onyx)',
        }}
      >
        {/* Top bar */}
        <header
          className="app-topbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 28px',
            borderBottom: '1px solid var(--border-dark)',
            background: 'var(--charcoal-mid)',
            flexShrink: 0,
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', color: 'var(--ivory)', letterSpacing: '0.04em' }}>
            Identity Sync — Pulse Quiz
          </div>
          {step === 'quiz' && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--ivory-muted)', textTransform: 'uppercase' }}>
              {current + 1} / {QUESTIONS.length}
            </div>
          )}
        </header>

        {/* Progress bar */}
        {step === 'quiz' && (
          <div style={{ height: '1px', background: 'var(--border-dark)', flexShrink: 0 }}>
            <div
              style={{
                height: '1px',
                background: 'var(--gold)',
                width: `${progress}%`,
                transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)',
              }}
            />
          </div>
        )}

        <div className="app-content" style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 28px' }}>

          {/* Gender select */}
          {step === 'gender' && (
            <div className="fade-in" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '16px' }}>
                ◈ Pulse Quiz · Step 0
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 400, color: 'var(--ivory)', lineHeight: 1.2, marginBottom: '10px' }}>
                Who are you looking for?
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ivory-muted)', marginBottom: '40px', lineHeight: 1.6 }}>
                This tells us which half of the archive to search.
              </div>

              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                {(['M', 'F'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => handleGender(g)}
                    style={{
                      flex: 1, maxWidth: '200px', padding: '28px 20px',
                      background: 'var(--charcoal)', border: '1px solid var(--border-mid)',
                      borderRadius: '3px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.border = '1px solid var(--gold)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--gold-glow)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.border = '1px solid var(--border-mid)';
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--charcoal)';
                    }}
                  >
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>{g === 'M' ? '△' : '▽'}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ivory)', marginBottom: '4px' }}>
                      {g === 'M' ? 'The Men' : 'The Women'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}>
                      10 Archetypes
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quiz questions */}
          {step === 'quiz' && (
            <div className="fade-in" style={{ maxWidth: '560px', width: '100%' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>
                ◈ Question {current + 1} — {QUESTIONS[current].dimension}
              </div>

              <div style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 400, color: 'var(--ivory)', lineHeight: 1.25, marginBottom: '32px' }}>
                {QUESTIONS[current].text}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
                {QUESTIONS[current].options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleAnswer(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 18px', background: 'var(--charcoal)',
                      border: '1px solid var(--border-mid)', borderRadius: '3px',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.border = '1px solid var(--gold-dim)';
                      el.style.background = 'var(--gold-glow)';
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.border = '1px solid var(--border-mid)';
                      el.style.background = 'var(--charcoal)';
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px', color: 'var(--ivory)', marginBottom: '2px' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ivory-muted)', fontStyle: 'italic' }}>
                        {opt.sub}
                      </div>
                    </div>
                    <span style={{ color: 'var(--gold)', opacity: 0.4, fontSize: '12px', marginLeft: '16px' }}>▷</span>
                  </button>
                ))}
              </div>

              {current > 0 && (
                <button
                  onClick={handleBack}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', padding: 0 }}
                >
                  ◁ Back
                </button>
              )}
            </div>
          )}

          {/* Results — top 5 matches */}
          {step === 'result' && (
            <div className="fade-in" style={{ maxWidth: '680px', width: '100%' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px', textAlign: 'center' }}>
                ◈ Your Matches
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--ivory)', textAlign: 'center', marginBottom: '6px' }}>
                The archive found your frequency.
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ivory-muted)', textAlign: 'center', marginBottom: '32px' }}>
                Add any to your collection or browse all 20 archetypes.
              </div>

              {/* Match cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {matches.map((result, i) => {
                  const a = result.archetype;
                  const score = Math.round(result.score * 100);
                  const isAdded = added.has(a.id);
                  const isAdding = adding === a.id;

                  return (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '16px 20px',
                        background: i === 0 ? 'var(--gold-glow)' : 'var(--charcoal)',
                        border: `1px solid ${i === 0 ? 'var(--gold-dim)' : 'var(--border-mid)'}`,
                        borderRadius: '3px',
                      }}
                    >
                      {/* Rank */}
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: i === 0 ? 'var(--gold)' : 'var(--ivory-ghost)', width: '20px', flexShrink: 0 }}>
                        #{i + 1}
                      </div>

                      {/* Avatar placeholder */}
                      <div style={{ width: '48px', height: '64px', borderRadius: '3px', background: a.imageGradient, flexShrink: 0 }} />

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ivory)' }}>{a.name}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--gold)', background: 'rgba(230,57,70,0.1)', border: '1px solid var(--gold-dim)', padding: '1px 6px', borderRadius: '2px' }}>{score}%</span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ivory-muted)', marginBottom: '2px' }}>{a.archetype}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ivory-ghost)', fontStyle: 'italic' }}>{a.tagline}</div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => router.push(`/dossier/${a.id}`)}
                          style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: '3px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ivory-muted)' }}
                        >
                          View
                        </button>
                        <button
                          onClick={() => !isAdded && handleAddToCollection(a.id)}
                          disabled={isAdding || isAdded}
                          style={{
                            padding: '7px 14px',
                            background: isAdded ? 'rgba(39,174,96,0.15)' : 'var(--gold)',
                            border: isAdded ? '1px solid rgba(39,174,96,0.4)' : 'none',
                            borderRadius: '3px',
                            cursor: isAdded ? 'default' : 'pointer',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '8px',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: isAdded ? '#27ae60' : 'var(--onyx)',
                            opacity: isAdding ? 0.6 : 1,
                            transition: 'all 0.2s',
                          }}
                        >
                          {isAdding ? '...' : isAdded ? '✓ Added' : '+ Add'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => router.push('/archive')}
                  className="btn-ghost"
                  style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                >
                  ◈ Browse All 20
                </button>
                <button
                  onClick={() => router.push('/onboarding')}
                  className="btn-gold"
                  style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                >
                  ◆ Create Custom
                </button>
                {added.size > 0 && (
                  <button
                    onClick={() => router.push('/dashboard')}
                    style={{ flex: 1, justifyContent: 'center', padding: '12px', background: '#27ae60', border: 'none', borderRadius: '3px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff' }}
                  >
                    Go to Collection →
                  </button>
                )}
              </div>

              <button
                onClick={() => { setStep('gender'); setAnswers([]); setCurrent(0); setGender(null); setMatches([]); setAdded(new Set()); }}
                style={{ display: 'block', width: '100%', marginTop: '12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ivory-ghost)', padding: '8px', textAlign: 'center' }}
              >
                ◁ Retake Quiz
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

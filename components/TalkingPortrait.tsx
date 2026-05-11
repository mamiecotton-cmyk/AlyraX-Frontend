'use client';

type TalkingPortraitState = 'idle' | 'listening' | 'speaking';

type Props = {
  imageUrl: string;
  name: string;
  state: TalkingPortraitState;
};

export default function TalkingPortrait({ imageUrl, name, state }: Props) {
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';

  return (
    <div
      className={[
        'talking-portrait absolute inset-0 w-full h-full overflow-hidden',
        isSpeaking ? 'is-speaking' : '',
        isListening ? 'is-listening' : '',
      ].filter(Boolean).join(' ')}
      aria-label={`${name} portrait`}
    >
      <img
        src={imageUrl}
        alt={name}
        className="talking-portrait-image absolute inset-0 h-full w-full object-contain"
      />

      <div className="talking-portrait-breath" />
      <div className="talking-portrait-mouth" />
      <div className="talking-portrait-presence" />
    </div>
  );
}

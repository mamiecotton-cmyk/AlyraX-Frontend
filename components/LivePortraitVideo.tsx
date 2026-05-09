'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  companionImageUrl: string;
  isCallActive: boolean;
  vapiInstance: any;
};

export default function LivePortraitVideo({ 
  companionImageUrl, 
  isCallActive,
  vapiInstance 
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isCallActive) {
      startCapture();
    } else {
      stopCapture();
      setVideoSrc(null);
      setIsAnimating(false);
    }

    return () => stopCapture();
  }, [isCallActive]);

  const startCapture = async () => {
    try {
      // Capture system audio output (AlyraX speaking)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: false 
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: 'audio/webm' 
          });
          audioChunksRef.current = [];
          await sendForAnimation(audioBlob);
        }
      };

      // Record in 2.5 second chunks
      mediaRecorder.start();
      intervalRef.current = setInterval(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          mediaRecorder.start();
        }
      }, 2500);

    } catch (error) {
      console.error('Audio capture error:', error);
    }
  };

  const stopCapture = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
  };

  const sendForAnimation = async (audioBlob: Blob) => {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audio_base64 = Buffer.from(arrayBuffer).toString('base64');

      const response = await fetch('/api/animate-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_base64,
          image_url: companionImageUrl,
        }),
      });

      const data = await response.json();

      if (data.video_base64) {
        const videoUrl = `data:video/mp4;base64,${data.video_base64}`;
        animationQueueRef.current.push(videoUrl);
        setIsAnimating(true);
        playNextInQueue();
      }
    } catch (error) {
      console.error('Animation request error:', error);
    }
  };

  const playNextInQueue = () => {
    if (isPlayingRef.current) return;
    if (animationQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    const nextVideo = animationQueueRef.current.shift()!;
    isPlayingRef.current = true;
    setVideoSrc(nextVideo);

    if (videoRef.current) {
      videoRef.current.src = nextVideo;
      videoRef.current.play().catch(console.error);
      videoRef.current.onended = () => {
        isPlayingRef.current = false;
        playNextInQueue();
      };
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full">
      {/* Still image — always present as base */}
      <img
        src={companionImageUrl}
        alt="companion"
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Animated video — overlays when active */}
      {isAnimating && videoSrc && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          muted={false}
          autoPlay
        />
      )}
    </div>
  );
}
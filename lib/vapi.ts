'use client';

type Listener = (...args: never[]) => void;
type StartOptions = {
  firstMessage?: string;
  firstMessageMode?: string;
  variableValues?: {
    activeCompanionId?: string;
  };
};
type DeepgramMessage = {
  type?: string;
  role?: string;
  content?: string;
};

const INPUT_SAMPLE_RATE = 24000;
const OUTPUT_SAMPLE_RATE = 24000;

class DeepgramVoiceClient {
  private listeners = new Map<string, Set<Listener>>();
  private socket: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private playbackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private stopping = false;

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  removeAllListeners() {
    this.listeners.clear();
  }

  private emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach(listener => listener(...args as never[]));
  }

  async start(_assistantId?: string, options?: StartOptions) {
    if (this.socket) this.stop();

    const tokenResponse = await fetch('/api/deepgram/token', { method: 'POST' });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error || 'Unable to create Deepgram token');
    }

    this.outputContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    this.inputContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    await this.outputContext.resume();
    await this.inputContext.resume();

    const socket = new WebSocket(
      `wss://agent.deepgram.com/v1/agent/converse?token=${encodeURIComponent(tokenData.access_token)}`
    );
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        this.handleServerMessage(JSON.parse(event.data), options);
        return;
      }

      const buffer = event.data instanceof Blob
        ? await event.data.arrayBuffer()
        : event.data as ArrayBuffer;
      this.playPcm16(buffer);
    };

    socket.onerror = (error) => {
      this.emit('error', error);
    };

    socket.onclose = () => {
      this.cleanup();
      if (!this.stopping) this.emit('call-end');
      this.stopping = false;
    };
  }

  stop() {
    const socket = this.socket;
    this.stopping = true;
    this.cleanup();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    this.emit('call-end');
  }

  say(message: string, ...options: unknown[]) {
    void options;
    if (!message.trim() || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      type: 'InjectAgentMessage',
      message,
      behavior: 'queue',
    }));
  }

  private async handleServerMessage(message: DeepgramMessage, options?: StartOptions) {
    if (message.type === 'Welcome') {
      this.sendSettings(options);
      return;
    }

    if (message.type === 'SettingsApplied') {
      try {
        await this.startMicrophone();
        this.startKeepAlive();
        this.emit('call-start');
        if (options?.firstMessage) this.say(options.firstMessage);
      } catch (error) {
        this.emit('error', error);
        this.stop();
      }
      return;
    }

    if (message.type === 'UserStartedSpeaking') {
      this.stopPlayback();
      this.emit('speech-end');
      return;
    }

    if (message.type === 'AgentStartedSpeaking') {
      this.emit('speech-start');
      return;
    }

    if (message.type === 'AgentAudioDone') {
      this.emit('speech-end');
      return;
    }

    if (message.type === 'ConversationText' && message.role && message.content) {
      this.emit('message', {
        type: 'transcript',
        role: message.role,
        transcript: message.content,
        transcriptType: 'final',
      });
      return;
    }

    if (message.type === 'Error') {
      this.emit('error', message);
      return;
    }

    if (message.type === 'Warning') {
      console.warn('Deepgram warning:', message);
    }
  }

  private sendSettings(options?: StartOptions) {
    const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const companionId = options?.variableValues?.activeCompanionId || '';
    const llmUrl = new URL('/api/llm/chat/completions', origin);
    if (companionId) llmUrl.searchParams.set('companionId', companionId);

    this.socket?.send(JSON.stringify({
      type: 'Settings',
      audio: {
        input: {
          encoding: 'linear16',
          sample_rate: INPUT_SAMPLE_RATE,
        },
        output: {
          encoding: 'linear16',
          sample_rate: OUTPUT_SAMPLE_RATE,
          container: 'none',
        },
      },
      agent: {
        language: 'en',
        listen: {
          provider: {
            type: 'deepgram',
            model: 'flux-general-en',
            version: 'v2',
            smart_format: true,
            eot_threshold: 0.75,
            eager_eot_threshold: 0.45,
          },
        },
        think: {
          provider: {
            type: 'open_ai',
            model: 'deepseek/deepseek-v4-flash',
            temperature: 0.8,
          },
          endpoint: {
            url: llmUrl.toString(),
          },
          prompt: 'You are AlyraX. Keep spoken replies intimate, natural, concise, and conversational. Ask one direct follow-up when the user is waiting.',
          context_length: 4000,
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: 'aura-2-thalia-en',
          },
        },
      },
    }));
  }

  private async startMicrophone() {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: INPUT_SAMPLE_RATE,
      },
    });

    if (!this.inputContext || !this.socket) return;

    this.source = this.inputContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.inputContext.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      this.socket.send(this.floatToPcm16(input));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputContext.destination);
  }

  private floatToPcm16(input: Float32Array) {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return buffer;
  }

  private playPcm16(buffer: ArrayBuffer) {
    if (!this.outputContext || buffer.byteLength === 0) return;

    const samples = new Int16Array(buffer);
    const audioBuffer = this.outputContext.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);

    for (let i = 0; i < samples.length; i += 1) {
      channel[i] = samples[i] / 32768;
    }

    const source = this.outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputContext.destination);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(item => item !== source);
    };

    const now = this.outputContext.currentTime;
    this.playbackTime = Math.max(this.playbackTime, now);
    source.start(this.playbackTime);
    this.playbackTime += audioBuffer.duration;
    this.activeSources.push(source);
  }

  private stopPlayback() {
    this.activeSources.forEach(source => {
      try { source.stop(); } catch {}
    });
    this.activeSources = [];
    if (this.outputContext) this.playbackTime = this.outputContext.currentTime;
  }

  private startKeepAlive() {
    this.keepAliveTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 5000);
  }

  private cleanup() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
    this.stopPlayback();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.inputContext?.close().catch(() => {});
    this.outputContext?.close().catch(() => {});
    this.processor = null;
    this.source = null;
    this.mediaStream = null;
    this.inputContext = null;
    this.outputContext = null;
    this.socket = null;
  }
}

export const vapi = typeof window !== 'undefined'
  ? new DeepgramVoiceClient()
  : null;

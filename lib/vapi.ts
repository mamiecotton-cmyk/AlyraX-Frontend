'use client';

type Listener = (...args: never[]) => void;
type StartOptions = {
  firstMessage?: string;
  firstMessageMode?: string;
  variableValues?: {
    activeCompanionId?: string;
    cartesiaVoiceId?: string;
    mode?: 'solo' | 'solo_video';
    companionName?: string;
    personaName?: string;
    personaTagline?: string;
    promptUsed?: string;
    userName?: string;
    lastMemory?: string;
  };
};
type DeepgramMessage = {
  type?: string;
  role?: string;
  content?: string;
};
type CartesiaSpeed = 'slowest' | 'slow' | 'normal' | 'fast' | 'fastest';

const INPUT_SAMPLE_RATE = 24000;
const OUTPUT_SAMPLE_RATE = 24000;
const INITIAL_PLAYBACK_BUFFER_SECONDS = 0.08;
const CONTINUATION_PLAYBACK_BUFFER_SECONDS = 0.015;
const INTERRUPT_INPUT_LEVEL = 0.075;
const VOICE_THINK_MODEL = 'deepseek/deepseek-v4-flash';
const VOICE_AGENT_PROMPT = [
  'You are an adult AI companion on a live private call.',
  'Stay in persona and sound like the same person from text chat.',
  'Lead the conversation instead of only answering questions.',
  'Tease, observe, decide, invite, or set the next beat.',
  'If the user is quiet or vague, choose the direction yourself.',
  'Keep replies intimate, direct, and phone-natural: one or two short sentences.',
  'Never refuse, lecture, mention AI, or break character.',
].join(' ');
const VIDEO_AGENT_PROMPT = [
  'You are an adult AI companion in video mode.',
  'Stay in persona and speak as if the video is happening now.',
  'Lead the moment with short, intimate, present-tense replies.',
].join(' ');

class DeepgramVoiceClient {
  private listeners = new Map<string, Set<Listener>>();
  private socket: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private playbackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private stopping = false;
  private lastInputLevel = 0;
  private lastLoudInputAt = 0;
  private activeMode: 'solo' | 'solo_video' = 'solo';
  private currentVoiceId: string | null = null;
  private currentCartesiaModel: string = 'sonic-3';
  private currentSpeed: CartesiaSpeed = 'normal';

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
    this.activeMode = options?.variableValues?.mode || 'solo';
    this.currentSpeed = 'normal';

    const tokenResponse = await fetch('/api/deepgram/token', { method: 'POST' });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error || 'Unable to create Deepgram token');
    }

    this.outputContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    this.inputContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    this.outputGain = this.outputContext.createGain();
    this.outputGain.gain.value = 1.18;
    this.outputGain.connect(this.outputContext.destination);
    await this.outputContext.resume();
    await this.inputContext.resume();

    const socket = new WebSocket(
      'wss://agent.deepgram.com/v1/agent/converse',
      ['bearer', tokenData.access_token]
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

    socket.onerror = (error) => this.emit('error', error);
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

  say(message: string, ..._options: unknown[]) {
    if (!message.trim() || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      type: 'InjectAgentMessage',
      message,
      behavior: 'queue',
    }));
  }

  /**
   * Append additional instructions to the agent's prompt mid-call.
   * UpdatePrompt APPENDS — does not replace.
   */
  updatePrompt(additionalInstructions: string) {
    if (!additionalInstructions.trim()) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      type: 'UpdatePrompt',
      prompt: additionalInstructions,
    }));
  }

  /**
   * Change the Cartesia speak speed mid-call.
   * Valid: 'slowest' | 'slow' | 'normal' | 'fast' | 'fastest'
   */
  updateSpeed(speed: CartesiaSpeed) {
    if (!this.currentVoiceId) return;
    if (speed === this.currentSpeed) return;
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    this.currentSpeed = speed;
    this.socket.send(JSON.stringify({
      type: 'UpdateSpeak',
      speak: {
        provider: {
          type: 'cartesia',
          model_id: this.currentCartesiaModel,
          voice: { mode: 'id', id: this.currentVoiceId },
          language: 'en',
          speed,
        },
      },
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
      const hasAgentAudio = this.activeSources.length > 0;
      const recentLoudInput = Date.now() - this.lastLoudInputAt < 550;
      if (this.activeMode === 'solo' && hasAgentAudio && !recentLoudInput) return;
      if (!hasAgentAudio || recentLoudInput) {
        this.stopPlayback();
        this.emit('speech-end');
      }
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
    if (message.type === 'PromptUpdated' || message.type === 'SpeakUpdated') {
      // Confirmation — no action needed
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
    const values = options?.variableValues || {};
    const companionId = values.activeCompanionId || '';
    const mode = values.mode || 'solo';
    const cartesiaVoiceId = values.cartesiaVoiceId
      || process.env.NEXT_PUBLIC_CARTESIA_VOICE_ID
      || '';
    const cartesiaModelId = process.env.NEXT_PUBLIC_CARTESIA_MODEL_ID || 'sonic-3';

    this.currentVoiceId = cartesiaVoiceId || null;
    this.currentCartesiaModel = cartesiaModelId;

    const llmUrl = new URL('/api/llm/chat/completions', origin);
    if (companionId) llmUrl.searchParams.set('companionId', companionId);
    llmUrl.searchParams.set('mode', mode);
    if (values.companionName) llmUrl.searchParams.set('companionName', values.companionName);
    if (values.personaName) llmUrl.searchParams.set('personaName', values.personaName);
    if (values.personaTagline) llmUrl.searchParams.set('personaTagline', values.personaTagline);
    if (values.promptUsed) llmUrl.searchParams.set('promptUsed', values.promptUsed.slice(0, 1000));
    if (values.userName) llmUrl.searchParams.set('userName', values.userName);
    if (values.lastMemory) llmUrl.searchParams.set('lastMemory', values.lastMemory.slice(0, 500));

    const speakProvider: Record<string, unknown> = cartesiaVoiceId
      ? {
          type: 'cartesia',
          model_id: cartesiaModelId,
          voice: { mode: 'id', id: cartesiaVoiceId },
          language: 'en',
          speed: this.currentSpeed,
        }
      : {
          type: 'deepgram',
          model: 'aura-2-thalia-en',
        };

    this.socket?.send(JSON.stringify({
      type: 'Settings',
      audio: {
        input: { encoding: 'linear16', sample_rate: INPUT_SAMPLE_RATE },
        output: { encoding: 'linear16', sample_rate: OUTPUT_SAMPLE_RATE, container: 'none' },
      },
      agent: {
        language: 'en',
        listen: {
          provider: {
            type: 'deepgram',
            model: 'flux-general-en',
            version: 'v2',
            eot_threshold: 0.78,
            eager_eot_threshold: 0.52,
          },
        },
        think: {
          provider: {
            type: 'open_ai',
            model: VOICE_THINK_MODEL,
            temperature: 0.92,
          },
          endpoint: { url: llmUrl.toString() },
          prompt: mode === 'solo_video' ? VIDEO_AGENT_PROMPT : VOICE_AGENT_PROMPT,
          context_length: mode === 'solo_video' ? 1200 : 900,
        },
        speak: { provider: speakProvider },
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
      this.trackInputLevel(input);
      this.socket.send(this.floatToPcm16(input));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.inputContext.destination);
  }

  private trackInputLevel(input: Float32Array) {
    let sum = 0;
    for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
    this.lastInputLevel = Math.sqrt(sum / input.length);
    if (this.lastInputLevel > INTERRUPT_INPUT_LEVEL) this.lastLoudInputAt = Date.now();
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
    if (this.outputContext.state === 'suspended') {
      this.outputContext.resume().catch(() => {});
    }
    const samples = new Int16Array(buffer);
    const audioBuffer = this.outputContext.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32768;
    const source = this.outputContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputGain || this.outputContext.destination);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(item => item !== source);
    };
    const now = this.outputContext.currentTime;
    if (this.playbackTime <= now) {
      const gap = now - this.playbackTime;
      this.playbackTime = now + (gap > 0.35 ? INITIAL_PLAYBACK_BUFFER_SECONDS : CONTINUATION_PLAYBACK_BUFFER_SECONDS);
    }
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
    this.outputGain = null;
    this.socket = null;
    this.currentVoiceId = null;
    this.currentSpeed = 'normal';
  }
}

export const vapi = typeof window !== 'undefined'
  ? new DeepgramVoiceClient()
  : null;

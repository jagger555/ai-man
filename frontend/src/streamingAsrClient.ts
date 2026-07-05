type StreamingAsrHandlers = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
};

type AsrServerMessage =
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string };

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

export class StreamingAsrClient {
  private readonly handlers: StreamingAsrHandlers;
  private websocket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private finished = false;

  constructor(handlers: StreamingAsrHandlers) {
    this.handlers = handlers;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("browser microphone is not supported");
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("browser audio capture is not supported");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContextClass();
    await this.audioContext.resume();

    this.websocket = await openAsrSocket();
    this.websocket.onmessage = (event) => this.handleMessage(event);
    this.websocket.onerror = () => {
      this.handlers.onError("speech service unavailable");
      this.close(false);
    };
    this.websocket.onclose = () => {
      this.handlers.onClose();
    };
    this.websocket.send(JSON.stringify({ type: "start" }));

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);
      output.fill(0);
      this.sendPcmChunk(input);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  finish() {
    this.stopCapture();
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: "finish" }));
    }
  }

  close(sendFinish = true) {
    if (sendFinish && this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({ type: "finish" }));
    }
    this.stopCapture();
    if (
      this.websocket &&
      (this.websocket.readyState === WebSocket.OPEN ||
        this.websocket.readyState === WebSocket.CONNECTING)
    ) {
      this.websocket.close();
    }
    this.websocket = null;
  }

  private sendPcmChunk(input: Float32Array) {
    if (this.websocket?.readyState !== WebSocket.OPEN || !this.audioContext) {
      return;
    }
    const pcm = encodePcm16(input, this.audioContext.sampleRate, TARGET_SAMPLE_RATE);
    if (pcm.byteLength > 0) {
      this.websocket.send(pcm);
    }
  }

  private handleMessage(event: MessageEvent) {
    if (typeof event.data !== "string") {
      return;
    }

    let message: AsrServerMessage;
    try {
      message = JSON.parse(event.data) as AsrServerMessage;
    } catch {
      return;
    }

    if (message.type === "partial") {
      this.handlers.onPartial(message.text);
      return;
    }
    if (message.type === "final") {
      this.finished = true;
      this.handlers.onFinal(message.text);
      this.close(false);
      return;
    }
    if (message.type === "error") {
      this.handlers.onError(message.message || "speech service unavailable");
      this.close(false);
    }
  }

  private stopCapture() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close();
    this.audioContext = null;
  }
}

function openAsrSocket(): Promise<WebSocket> {
  const websocket = new WebSocket(buildAsrSocketUrl());
  websocket.binaryType = "arraybuffer";

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      websocket.removeEventListener("open", handleOpen);
      websocket.removeEventListener("error", handleError);
    };
    const handleOpen = () => {
      cleanup();
      resolve(websocket);
    };
    const handleError = () => {
      cleanup();
      reject(new Error("speech service unavailable"));
    };
    websocket.addEventListener("open", handleOpen);
    websocket.addEventListener("error", handleError);
  });
}

function buildAsrSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/speech/asr-stream`;
}

function encodePcm16(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
) {
  const downsampled = downsample(input, inputSampleRate, targetSampleRate);
  const pcm = new Int16Array(downsampled.length);
  for (let index = 0; index < downsampled.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, downsampled[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

function downsample(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
) {
  if (inputSampleRate === targetSampleRate) {
    return input;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(Math.floor((outputIndex + 1) * ratio), input.length);
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += input[inputIndex];
    }
    output[outputIndex] = sum / Math.max(1, end - start);
  }
  return output;
}

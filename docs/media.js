// Records voice and video messages, and encrypts them before they leave the browser.
export const MAX_SECONDS = { voice: 60, video: 30 };

// MP4 first because it plays on the most phones. Safari records MP4, Firefox only WebM.
const FORMATS = {
  voice: ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"],
  video: ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"],
};

export class Recorder {
  static supported = Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia && crypto.subtle);

  constructor(kind) {
    this.kind = kind;
    this.stream = null;
    this.media = null;
  }

  get recording() {
    return this.media?.state === "recording";
  }

  async open() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.kind === "video" ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
  }

  // Resolves with the recording once stop() is called.
  record() {
    const mimeType = FORMATS[this.kind].find((type) => MediaRecorder.isTypeSupported(type));
    this.media = new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: 48000, videoBitsPerSecond: 500000 });
    const chunks = [];
    this.media.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise((resolve) => {
      this.media.onstop = () => resolve(new Blob(chunks, { type: this.media.mimeType }));
    });
    this.media.start();
    return finished;
  }

  stop() {
    if (this.recording) this.media.stop();
  }

  close() {
    this.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function seal(blob) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await blob.arrayBuffer());
  return { blob: new Blob([cipher], { type: "application/octet-stream" }), key: toBase64Url(rawKey), iv: toBase64Url(iv) };
}

export async function unseal(url, media) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("not found");
  const key = await crypto.subtle.importKey("raw", fromBase64Url(media.key), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(media.iv) }, key, await response.arrayBuffer());
  return new Blob([plain], { type: media.type });
}

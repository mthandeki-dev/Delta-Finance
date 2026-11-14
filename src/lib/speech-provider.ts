// ─── SpeechProvider abstraction ───────────────────────────────────────────────
// Components consume SpeechProvider; they never touch the recording API directly.

export interface SpeechProviderCallbacks {
  onStart(): void;
  /** interim = still-being-spoken text; newFinal = just-confirmed text (may be empty) */
  onResult(interim: string, newFinal: string): void;
  onEnd(): void;
  onError(code: string): void;
}

export interface SpeechProvider {
  start(lang: string, cbs: SpeechProviderCallbacks): void;
  stop(): void;
  abort(): void;
}

// ─── Cloud speech provider (Vulavula / Google Cloud STT) ─────────────────────
// Records audio via MediaRecorder, sends the blob to /api/speech for cloud
// transcription. No interim results — the transcript arrives in one shot after
// the user stops recording.

export function isCloudSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

export function createCloudSpeechProvider(): SpeechProvider {
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let aborted = false;
  let storedLang = 'en-ZA';
  let storedCbs: SpeechProviderCallbacks | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;

  function clearMax() {
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  }

  return {
    start(lang, cbs) {
      storedLang = lang;
      storedCbs  = cbs;
      chunks     = [];
      aborted    = false;

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        if (aborted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const mimeType =
          MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
          MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')  ? 'audio/ogg;codecs=opus'  :
          'audio/webm';

        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch {
          stream.getTracks().forEach((t) => t.stop());
          cbs.onError('not-supported');
          return;
        }

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          clearMax();
          stream.getTracks().forEach((t) => t.stop());

          if (aborted || !chunks.length) {
            storedCbs?.onEnd();
            return;
          }

          try {
            const blob     = new Blob(chunks, { type: mimeType });
            const form     = new FormData();
            form.append('file', blob, 'recording.webm');
            form.append('lang', storedLang);

            const res = await fetch('/api/speech', { method: 'POST', body: form });
            if (!res.ok) throw new Error(`STT ${res.status}`);
            const { transcript } = (await res.json()) as { transcript: string };
            if (transcript) storedCbs?.onResult('', transcript);
          } catch {
            storedCbs?.onError('transcription-failed');
          }

          storedCbs?.onEnd();
        };

        mediaRecorder.start(500);
        cbs.onStart();

        // Safety: auto-stop at 30 s to cap audio blob size
        maxTimer = setTimeout(() => {
          if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
        }, 30_000);

      }).catch((e: unknown) => {
        const name = e instanceof DOMException ? e.name : '';
        cbs.onError(name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture');
      });
    },

    stop()  { clearMax(); if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); },
    abort() { aborted = true; clearMax(); if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); },
  };
}

// ─── Browser Web Speech API provider ─────────────────────────────────────────

export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export function createBrowserSpeechProvider(): SpeechProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rec: any = null;

  return {
    start(lang, cbs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (!SR) {
        cbs.onError('not-supported');
        return;
      }

      rec = new SR();
      rec.lang            = lang;
      rec.continuous      = true;
      rec.interimResults  = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => cbs.onStart();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        let interim  = '';
        let newFinal = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) newFinal += e.results[i][0].transcript as string;
          else                       interim  += e.results[i][0].transcript as string;
        }
        cbs.onResult(interim, newFinal.trim());
      };

      rec.onend = () => cbs.onEnd();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => cbs.onError(e.error as string);

      rec.start();
    },

    stop()  { rec?.stop();  },
    abort() { rec?.abort(); },
  };
}

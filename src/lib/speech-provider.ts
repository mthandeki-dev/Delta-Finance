// ─── SpeechProvider abstraction ───────────────────────────────────────────────
// Components consume SpeechProvider; they never touch SpeechRecognition directly.
// To swap to Google Cloud Speech or Azure Cognitive Services, implement the
// SpeechProvider interface and pass the new instance into AgentConsole.

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
        // Only process new results from resultIndex onward — prevents duplication
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

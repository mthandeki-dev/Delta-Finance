// Message protocol for multi-language payment instructions.
//
// Every voice or typed instruction travels through five stages before reaching the agent:
//
//   1. CAPTURE    raw STT output or typed text, in any supported language
//   2. NORMALISE  instant client-side pass: keyword substitution + mishearing fixes + vendor name correction
//   3. TRANSLATE  async server-side pass → English (non-English only); Vulavula → Google → LLM → keyword-map
//   4. REVIEW     user reads and optionally edits the English text in the textarea
//   5. DISPATCH   reviewed English text is POSTed to /api/agent for intent parsing and execution
//
// The agent always receives English. Translation is transparent to the downstream intent parser,
// the grounding layer, the policy router, and the settlement path.

export type TranslationMethod =
  | 'passthrough'   // source was already English — no change
  | 'keyword-map'   // cloud translation unavailable; payment verbs replaced via PAYMENT_KEYWORD_MAP
  | 'vulavula'      // Lelapa AI Vulavula Translation API (African-language specialist)
  | 'google'        // Google Cloud Translation API
  | 'llm';          // full Anthropic translation

export type PipelineStage = 'capture' | 'normalise' | 'translate' | 'review' | 'dispatch';

/** Shared request body for POST /api/translate */
export interface TranslateRequest {
  text: string;
  sourceLang: string; // BCP-47 code, e.g. "zu-ZA"
}

/** Response body from POST /api/translate */
export interface TranslateResponse {
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: 'en';
  method: TranslationMethod;
}

/** Full message envelope as it flows through the client pipeline */
export interface MessageEnvelope {
  stage: PipelineStage;
  rawText: string;              // unchanged STT output
  currentText: string;          // text at the current stage
  sourceLang: string;
  translationMethod?: TranslationMethod;
  sourceLangLabel?: string;     // human-readable label, e.g. "isiZulu"
}

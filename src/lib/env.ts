import { AppError } from './errors';

// Read lazily so `next build` works without secrets and each missing value fails with a clear message.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new AppError(500, 'CONFIG_MISSING', `Server is missing the ${name} environment variable.`);
  return v;
}
const optional = (name: string, fallback = '') => process.env[name] || fallback;

export const env = {
  get sessionSecret() {
    const s = required('SESSION_SECRET');
    if (process.env.NODE_ENV === 'production' && s.length < 32) {
      throw new AppError(500, 'CONFIG_WEAK', 'SESSION_SECRET must be at least 32 characters in production.');
    }
    return s;
  },
  get appUrl() {
    // APP_URL takes precedence. On Netlify, URL is auto-injected; use it as fallback.
    return optional('APP_URL') || optional('URL') || 'http://localhost:3000';
  },
  get internalUrl() {
    // On Netlify there is no loopback — serverless functions must call themselves via the public URL.
    return optional('INTERNAL_URL') || optional('URL') || `http://127.0.0.1:${optional('PORT', '3000')}`;
  },
  get adminAddresses() {
    return optional('ADMIN_XRPL_ADDRESSES')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get xamanKey() {
    return required('XAMAN_API_KEY');
  },
  get xamanSecret() {
    return required('XAMAN_API_SECRET');
  },
  get privyAppId() {
    return required('PRIVY_APP_ID');
  },
  get privyAppSecret() {
    return required('PRIVY_APP_SECRET');
  },
  get agentApiKey() {
    return required('AGENT_API_KEY');
  },
  get anthropicKey() {
    return optional('ANTHROPIC_API_KEY');
  },
  get llmModel() {
    return optional('LLM_MODEL', 'claude-haiku-5-5');
  },
  get allowRedTeam() {
    return optional('ALLOW_REDTEAM_DEMO') === 'true';
  },
  get xrplWss() {
    return optional('XRPL_WSS', 'wss://s.altnet.rippletest.net:51233');
  },
  get faucetUrl() {
    return optional('XRPL_FAUCET_URL', 'https://faucet.altnet.rippletest.net/accounts');
  },
  get rlusdIssuer() {
    return optional('RLUSD_ISSUER', 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV');
  },
  get facilitatorUrl() {
    return optional('T54_FACILITATOR_URL', 'https://xrpl-facilitator-testnet.t54.ai').replace(/\/$/, '');
  },
  get sourceTag() {
    return Number(optional('T54_SOURCE_TAG', '804681468'));
  },
  get directSubmitFallback() {
    return optional('X402_DIRECT_SUBMIT_FALLBACK') === 'true';
  },
  /** Indicative display rate only (e.g. ZAR per 1 USD). Never used for settlement. */
  get displayFx() {
    const rate = Number(optional('DISPLAY_FX_RATE'));
    const code = optional('DISPLAY_FX_CODE', 'ZAR');
    return Number.isFinite(rate) && rate > 0 ? { code, rate } : null;
  },
  configured: {
    get xaman() {
      return Boolean(process.env.XAMAN_API_KEY && process.env.XAMAN_API_SECRET);
    },
    get privy() {
      return Boolean(process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET);
    },
    get llm() {
      return Boolean(process.env.ANTHROPIC_API_KEY);
    },
  },
};

// 40-hex currency code for "RLUSD" (codes longer than 3 characters must be hex on the XRPL)
export const RLUSD_HEX = '524C555344000000000000000000000000000000';
export const X402_NETWORK = 'xrpl:1'; // XRPL Testnet
export const EXPLORER_TX = 'https://testnet.xrpl.org/transactions/';

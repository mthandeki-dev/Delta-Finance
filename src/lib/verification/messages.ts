// User-visible messages for each failed check. Internal reasons never reach the client.

export const USER_MESSAGES: Record<string, string> = {
  PRIVY_AUTH: 'Your session could not be verified. Please sign in again.',
  DB_CONTEXT: 'The payment could not be verified right now. Please try again.',
  // Exact wording required by spec — do not change.
  WHITELIST: 'Recipient not whitelisted',
  THRESHOLD: 'This payment exceeds your personal approval limit.',
  DUPLICATE: 'A very similar payment was submitted recently. Please wait before retrying.',
};

export function sanitiseOutcomeReason(failedCheck: string | null | undefined): string {
  if (!failedCheck) return 'The payment was blocked by a verification check.';
  return USER_MESSAGES[failedCheck] ?? 'The payment was blocked by a verification check.';
}

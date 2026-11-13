'use client';

export function WhitelistBadge({ whitelisted }: { whitelisted: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${whitelisted ? 'text-green-400' : 'text-neutral-400'}`}
      title={whitelisted ? 'Recipient is on the approved vendor list' : 'Recipient is not on the approved vendor list'}
      aria-label={whitelisted ? 'Whitelisted' : 'Not whitelisted'}
    >
      {whitelisted ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
        </svg>
      )}
      {whitelisted ? 'Whitelisted' : 'Not whitelisted'}
    </span>
  );
}

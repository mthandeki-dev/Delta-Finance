/** Delta Finance mark: yellow tile, black "DF" with a delta cut into the D. */
export function Logo({ size = 36, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Delta Finance logo">
        <rect width="64" height="64" rx="12" fill="#FFD60A" />
        <path
          fill="#000"
          fillRule="evenodd"
          d="M10 14H23C33.5 14 40 21.5 40 32C40 42.5 33.5 50 23 50H10ZM17.5 21V43H22.5C28.5 43 32.5 38.8 32.5 32C32.5 25.2 28.5 21 22.5 21Z"
        />
        <path fill="#000" d="M43.5 14H56V21H51V28.5H55V35.5H51V50H43.5Z" />
        <path fill="#000" d="M19.5 40L24.25 31.5L29 40Z" />
      </svg>
      {withWordmark && (
        <span className="text-lg font-bold tracking-tight text-white">
          Delta <span className="text-df-yellow">Finance</span>
        </span>
      )}
    </span>
  );
}

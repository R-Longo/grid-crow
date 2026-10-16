import type { ReactNode } from "react";

// Small stroke icon set drawn in code (no icon library dependency).
// Ratio icons are named "ratio-<w>-<h>", e.g. "ratio-3-4".

export type IconName =
  | "image"
  | "yarn"
  | "portrait"
  | "landscape"
  | "overlap"
  | "palette"
  | "pencil"
  | "fill"
  | "dropper"
  | "hand"
  | "undo"
  | "redo"
  | "reset"
  | "fit"
  | "plus"
  | "minus"
  | "options"
  | "download"
  | "help"
  | "close"
  | "check"
  | "arrow"
  | "chevron"
  | `ratio-${number}-${number}`;

const PATHS: Record<string, ReactNode> = {
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </>
  ),
  yarn: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6.5c4 1 8 4.5 12 11.5M4.5 11c3.500.5 8.500 4 11 9M10 4c3 1.500 7.500 5.500 9.500 11M17 19.500c1.500.5 3 .3 4-.5" />
    </>
  ),
  portrait: <rect x="7" y="3" width="10" height="18" rx="2" />,
  landscape: <rect x="3" y="7" width="18" height="10" rx="2" />,
  // Two overlapping rectangles: reads as "different finished dimensions".
  overlap: (
    <>
      <rect x="3" y="9" width="12" height="12" rx="1.5" />
      <rect x="9" y="3" width="12" height="12" rx="1.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.200 0 2-.8 2-1.800 0-1-.8-1.400-.8-2.200 0-.9.7-1.500 1.700-1.500H17a4 4 0 0 0 4-4C21 6.700 17 3 12 3z" />
      <circle cx="7.500" cy="11" r="1" />
      <circle cx="10" cy="7" r="1" />
      <circle cx="14.500" cy="7" r="1" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-4L16.500 4.500a2 2 0 0 1 3 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </>
  ),
  // Paint bucket.
  fill: (
    <>
      <path d="M5 11l6-6 7 7-6 6a2 2 0 0 1-3 0l-4-4a2 2 0 0 1 0-3z" />
      <path d="M5 11h13M20 15c0 1.500-1 2.500-1 3.500a1 1 0 0 0 2 0c0-1-1-2-1-3.500z" />
    </>
  ),
  dropper: (
    <>
      <path d="M14 6l4 4M16 4l4 4-2 2-4-4 2-2zM13 7l-8 8-1 4 4-1 8-8" />
    </>
  ),
  hand: (
    <>
      <path d="M8 12V6a1.500 1.500 0 0 1 3 0v5M11 11V4.500a1.500 1.500 0 0 1 3 0V11M14 11V6a1.500 1.500 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2.500-3.500a1.500 1.500 0 0 1 2.300-1.800L8 15" />
    </>
  ),
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-4" />,
  redo: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h4" />,
  reset: <path d="M4 12a8 8 0 1 0 2.500-5.800M4 4v4h4" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  options: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />,
  download: <path d="M12 4v11M7.500 10.500L12 15l4.500-4.500M5 19h14" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 .9-1 1.700M12 17h.01" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.500l4.500 4.500L19 7.500" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 22, className }: IconProps) {
  let content: ReactNode;
  if (name.startsWith("ratio-")) {
    const [, a, b] = name.split("-").map(Number);
    const scale = 16 / Math.max(a, b);
    const w = a * scale;
    const h = b * scale;
    content = <rect x={12 - w / 2} y={12 - h / 2} width={w} height={h} rx="1.500" />;
  } else {
    content = PATHS[name];
  }
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
}

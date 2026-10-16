import crowSrc from "../assets/crow.png";

// One small picture per finished size: the same crow beside an upright tapestry
// rectangle that grows from the smallest size to the largest.
//
// The crow image is identical in every picture. Only the rectangle changes, using a
// controlled set of visual heights (in SVG units), one per size in sizes.ts order.
// Widths follow each size's real portrait proportions.
export const TAPESTRY_VISUAL_HEIGHTS = [12, 15.5, 19, 22.5, 25.5, 28];

// Drawing area: 56 × 32 units. The crow's feet and the tapestry share one baseline.
const VIEW_W = 56;
const VIEW_H = 32;
const CROW_H = 30;
const CROW_W = CROW_H * 0.975; // crow.png is 117 × 120
const CROW_Y = 1;
const FEET_FRACTION = 0.93; // where the feet end inside the crow image (top = 0)
const BASELINE = CROW_Y + CROW_H * FEET_FRACTION;
const GAP = 3;

interface SizeIllustrationProps {
  /** Portrait finished width in inches (used only for proportions). */
  widthIn: number;
  /** Portrait finished height in inches. */
  heightIn: number;
  /** Index into TAPESTRY_VISUAL_HEIGHTS (0 = smallest size). */
  level: number;
}

export function SizeIllustration({ widthIn, heightIn, level }: SizeIllustrationProps) {
  const h = TAPESTRY_VISUAL_HEIGHTS[Math.min(level, TAPESTRY_VISUAL_HEIGHTS.length - 1)];
  const w = (h * widthIn) / heightIn;
  const stroke = 1;
  return (
    <svg
      className="size-art"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <image href={crowSrc} x={0} y={CROW_Y} width={CROW_W} height={CROW_H} />
      <rect
        className="size-art__tapestry"
        x={CROW_W + GAP + stroke / 2}
        y={BASELINE - h + stroke / 2}
        width={w - stroke}
        height={h - stroke}
        rx="1"
        strokeWidth={stroke}
      />
    </svg>
  );
}

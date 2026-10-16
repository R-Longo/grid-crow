import type { IconName } from "../components/Icon";
import { finishedDimensions } from "../engine/geometry";
import type { FinishedSizeId, MaxColors, Orientation, SetupSettings } from "../types";
import { DEFAULT_SIZE_ID, FINISHED_SIZES } from "./sizes";

// Choices shown on the setup screen.
// Gauge lives in config/gauge.ts and sizes in config/sizes.ts.

export interface OptionDef<T> {
  value: T;
  label: string;
  hint?: string;
  icon?: IconName;
  /** CSS color for the icon. */
  iconColor?: string;
}

export const ORIENTATION_OPTIONS: OptionDef<Orientation>[] = [
  { value: "portrait", label: "Portrait", icon: "portrait" },
  { value: "landscape", label: "Landscape", icon: "landscape" },
];

/** The six finished sizes, labelled with real dimensions (reversed for landscape). */
export function sizeOptions(orientation: Orientation): OptionDef<FinishedSizeId>[] {
  return FINISHED_SIZES.map((s) => {
    const { widthInches, heightInches } = finishedDimensions(s.id, orientation);
    return {
      value: s.id,
      label: `${widthInches} × ${heightInches} in`,
      icon: `ratio-${widthInches}-${heightInches}` as const,
    };
  });
}

export const COLOR_OPTIONS: OptionDef<MaxColors>[] = [
  { value: 4, label: "4" },
  { value: 6, label: "6" },
  { value: 8, label: "8" },
  { value: 10, label: "10" },
];

export const DEFAULT_SETTINGS: SetupSettings = {
  orientation: "portrait",
  sizeId: DEFAULT_SIZE_ID,
  maxColors: 6,
};

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

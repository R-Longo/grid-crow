import type { FinishedSizeId } from "./config/sizes";

export type { FinishedSizeId };
export type Orientation = "portrait" | "landscape";
export type MaxColors = 4 | 6 | 8 | 10;

/** A size and gauge the person typed in Manual Mode instead of picking a preset. */
export interface CustomSize {
  widthInches: number;
  heightInches: number;
  stitchesPerInch: number;
  rowsPerInch: number;
}

export interface SetupSettings {
  orientation: Orientation;
  /** A preset, or "custom" when `custom` holds the person's own size and gauge. */
  sizeId: FinishedSizeId | "custom";
  maxColors: MaxColors;
  custom?: CustomSize;
}

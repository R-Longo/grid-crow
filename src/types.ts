import type { FinishedSizeId } from "./config/sizes";

export type { FinishedSizeId };
export type Orientation = "portrait" | "landscape";
export type MaxColors = 4 | 6 | 8 | 10;

export interface SetupSettings {
  orientation: Orientation;
  sizeId: FinishedSizeId;
  maxColors: MaxColors;
}

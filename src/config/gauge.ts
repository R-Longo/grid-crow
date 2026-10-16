// GridCrow V1 uses ONE standard gauge. Change the numbers here and every
// grid size, label, and note in the app updates. No other file hard-codes gauge.
//
// Standard worsted weight #4 yarn, 5 mm hook, single crochet:
//   16 stitches across and 18 rows high make a 4-inch swatch.

export const STANDARD_GAUGE = {
  yarnLabel: "Worsted weight #4",
  hookLabel: "5 mm",
  stitchesPerSwatch: 16,
  rowsPerSwatch: 18,
  swatchInches: 4,
} as const;

/** 16 / 4 = 4 stitches per inch. */
export const STITCHES_PER_INCH = STANDARD_GAUGE.stitchesPerSwatch / STANDARD_GAUGE.swatchInches;

/** 18 / 4 = 4.5 rows per inch. */
export const ROWS_PER_INCH = STANDARD_GAUGE.rowsPerSwatch / STANDARD_GAUGE.swatchInches;

/** The reference gauge as carried inside a GridSpec (so the converter sees what the UI used). */
export interface ReferenceGauge {
  yarnLabel: string;
  hookLabel: string;
  stitchesPerInch: number;
  rowsPerInch: number;
}

export const REFERENCE_GAUGE: ReferenceGauge = {
  yarnLabel: STANDARD_GAUGE.yarnLabel,
  hookLabel: STANDARD_GAUGE.hookLabel,
  stitchesPerInch: STITCHES_PER_INCH,
  rowsPerInch: ROWS_PER_INCH,
};

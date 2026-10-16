import { convertRaster } from "./convert";
import { ConversionError } from "./types";
import type { CropState, Raster } from "./types";
import type { GridSpec } from "../geometry";

// Runs the conversion off the main thread so the page stays responsive.
interface Request {
  raster: Raster;
  crop: CropState;
  spec: GridSpec;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (m: unknown) => void;
};

ctx.onmessage = (e) => {
  try {
    const matrix = convertRaster(e.data.raster, e.data.crop, e.data.spec);
    ctx.postMessage({ ok: true, matrix });
  } catch (err) {
    const message = err instanceof ConversionError ? err.message : "Something went wrong while building your grid.";
    ctx.postMessage({ ok: false, message });
  }
};

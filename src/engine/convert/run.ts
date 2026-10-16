import type { GridSpec } from "../geometry";
import { convertRaster } from "./convert";
import { ConversionError } from "./types";
import type { CropState, Raster, StitchMatrix } from "./types";

/**
 * Convert in a background worker (falls back to the main thread if workers aren't available).
 * The picture's pixels are handed to the worker, not uploaded anywhere.
 */
export function convertInBackground(raster: Raster, crop: CropState, spec: GridSpec): Promise<StitchMatrix> {
  if (typeof Worker === "undefined") {
    return new Promise((resolve, reject) => {
      // Yield once so the "working" state can paint first.
      setTimeout(() => {
        try {
          resolve(convertRaster(raster, crop, spec));
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const done = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<{ ok: boolean; matrix?: StitchMatrix; message?: string }>) => {
      done();
      if (e.data.ok && e.data.matrix) resolve(e.data.matrix);
      else reject(new ConversionError("invalid-raster", e.data.message ?? "Something went wrong while building your grid."));
    };
    worker.onerror = () => {
      done();
      reject(new ConversionError("invalid-raster", "Something went wrong while building your grid."));
    };
    worker.postMessage({ raster, crop, spec }, [raster.data.buffer]);
  });
}

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { MAX_ZOOM, MIN_ZOOM, cropRect, moveCrop } from "../engine/convert/crop";
import type { DecodedImage } from "../engine/convert/decode";
import type { CropState } from "../engine/convert/types";

interface CropPreviewProps {
  image: DecodedImage;
  /** Physical width ÷ height of the finished tapestry. */
  aspect: number;
  crop: CropState;
  onChange: (crop: CropState) => void;
}

/**
 * Shows exactly the part of the picture that will be converted, in the finished tapestry's
 * physical proportions. Drag (or use arrow keys) to move; the slider zooms in.
 */
export function CropPreview({ image, aspect, crop, onChange }: CropPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const zoomId = useId();

  // Track the displayed width so the canvas is drawn at a matching pixel size.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setCssWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || cssWidth === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(cssWidth * dpr);
    el.height = Math.round((cssWidth / aspect) * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const r = cropRect(image.width, image.height, aspect, crop);
    ctx.fillStyle = "#ffffff"; // transparent areas are shown (and converted) on white
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.bitmap, r.x, r.y, r.w, r.h, 0, 0, el.width, el.height);
  }, [image, aspect, crop, cssWidth]);

  const pan = (dxCss: number, dyCss: number) => {
    if (cssWidth === 0) return;
    const r = cropRect(image.width, image.height, aspect, crop);
    const k = r.w / cssWidth; // source pixels per displayed pixel
    onChange(moveCrop(image.width, image.height, aspect, crop, -dxCss * k, -dyCss * k));
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    pan(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = cssWidth * 0.05;
    if (e.key === "ArrowLeft") pan(step, 0);
    else if (e.key === "ArrowRight") pan(-step, 0);
    else if (e.key === "ArrowUp") pan(0, step * aspect);
    else if (e.key === "ArrowDown") pan(0, -step * aspect);
    else return;
    e.preventDefault();
  };

  return (
    <div className="crop">
      <canvas
        ref={canvasRef}
        className="crop__canvas"
        style={{ aspectRatio: String(aspect), width: `min(100%, ${26 * aspect}rem)` }}
        tabIndex={0}
        role="img"
        aria-label="Crop area. Drag, or use the arrow keys, to choose which part of your picture to keep."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
      <div className="crop__controls">
        <label htmlFor={zoomId}>Zoom</label>
        <input
          id={zoomId}
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={crop.zoom}
          onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) })}
        />
      </div>
      <p className="crop__hint">Drag the picture to choose what to keep.</p>
    </div>
  );
}

import { useCallback, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { ACCEPTED_IMAGE_TYPES } from "../config/options";
import { Icon } from "./Icon";

interface UploadZoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Shown in place of the picture once a file is chosen (the crop area). */
  preview?: ReactNode;
  /** An error found after the file was chosen, such as a damaged image. */
  externalError?: string | null;
}

export function UploadZone({ file, onFileChange, preview, externalError }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = useCallback(
    (candidate: File | undefined) => {
      if (!candidate) return;
      if (!ACCEPTED_IMAGE_TYPES.includes(candidate.type)) {
        setError("That file type isn't supported. Please choose a PNG, JPG, or WebP image.");
        return;
      }
      setError(null);
      onFileChange(candidate);
    },
    [onFileChange],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const clear = () => {
    setError(null);
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          // Forget the choice so picking the same file again still counts as a change. That matters when a
          // "replace your edited chart?" question was answered "Keep editing" and the person tries again.
          e.target.value = "";
        }}
      />

      {file ? (
        <div className="preview">
          {preview}
          <p className="preview__meta">{file.name}</p>
          <div className="preview__actions">
            <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
              Choose a different image
            </button>
            <button type="button" className="btn btn--quiet" onClick={clear}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`upload${dragging ? " upload--active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="upload__icon">
            <Icon name="image" size={40} />
          </span>
          <p className="upload__prompt">Upload your photo or drawing</p>
          <p className="upload__formats">Drag and drop, or browse. JPG, PNG, or WebP.</p>
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            Browse files
          </button>
        </div>
      )}

      {(externalError || error) && (
        <p className="upload__error" role="alert">
          {externalError || error}
        </p>
      )}
      <p className="privacy-note">Your image stays on your device. Nothing is uploaded.</p>
    </div>
  );
}

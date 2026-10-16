import { describe, expect, it } from "vitest";
import { checkImageFile, sniffImageType } from "./decode";
import { ConversionError } from "./types";

const bytes = (...n: number[]) => new Uint8Array(n);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
const TEXT = new TextEncoder().encode("this is not a picture");

describe("9. unsupported and corrupt files give useful errors", () => {
  it("recognises JPG, PNG and WebP from their first bytes", () => {
    expect(sniffImageType(JPG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(TEXT)).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });

  it("accepts valid files of the three supported types", () => {
    expect(() => checkImageFile("image/png", 1000, PNG)).not.toThrow();
    expect(() => checkImageFile("image/jpeg", 1000, JPG)).not.toThrow();
    expect(() => checkImageFile("image/webp", 1000, WEBP)).not.toThrow();
  });

  it("rejects other types with a clear message", () => {
    expect(() => checkImageFile("image/gif", 1000, PNG)).toThrow(/JPG, PNG, or WebP/);
    expect(() => checkImageFile("application/pdf", 1000, TEXT)).toThrow(ConversionError);
  });

  it("rejects empty, oversized, and mislabeled/corrupt files", () => {
    expect(() => checkImageFile("image/png", 0, bytes())).toThrow(/empty/);
    expect(() => checkImageFile("image/png", 31 * 1024 * 1024, PNG)).toThrow(/too large/);
    expect(() => checkImageFile("image/png", 500, TEXT)).toThrow(/valid JPG, PNG, or WebP/);
  });

  it("errors carry a code the UI can use", () => {
    try {
      checkImageFile("image/gif", 10, PNG);
    } catch (e) {
      expect(e).toBeInstanceOf(ConversionError);
      expect((e as ConversionError).code).toBe("unsupported-type");
    }
  });
});

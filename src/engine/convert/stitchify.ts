import { deltaE } from "./color";

/** Index of the palette color closest to the Lab color at lab[o]. Ties go to the lower index. */
export function nearestPalette(lab: ArrayLike<number>, o: number, palette: Float64Array, k: number): number {
  let best = 0;
  let bd = Infinity;
  for (let c = 0; c < k; c++) {
    const d = deltaE(lab, o, palette, c * 3);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * Tunables of the stitch vote. A feature thinner than a stitch only covers part of the stitch
 * footprint (a 1-pixel line in a stitch six pixels wide covers about 1/6), so plain majority wins
 * for the background and erases it. Votes for a color that contrasts with the LOCAL DOMINANT color
 * (what most of the surrounding stitches are made of) count up to 1 + boost times, so a line that
 * covers a quarter of a stitch becomes one stitch of line, which is how a crocheter has to draw it.
 */
export const VOTE = {
  /** Extra weight for a fully contrasting color (0 = plain majority). */
  boost: 0.5,
  /** Overall color difference (Lab) at which the boost is at its maximum. */
  fullDE: 40,
  /** Hue/chroma difference (Lab a and b axes) at which the boost is at its maximum. A blue iris in dark
   *  fur is a modest overall difference but a clear hue difference, and hue is what the eye notices. */
  fullChroma: 20,
  /** Extra weight used by the thin-line coverage rule (see below). */
  inkBoost: 2.0,
  /** Only strongly contrasting colors get the coverage treatment below (share of fullDE). */
  inkContrast: 0.6,
  /** A pixel counts as "mostly p" when it is at least this far along the way from the dominant color to p. */
  inkReach: 0.45,
  /** ...and no further than this (Lab ΔE) off the straight line between the two colors. */
  inkOffLine: 10,
  /** The coverage treatment is for thin features on a calm field: it only applies where the dominant color
   *  fills at least this share of the 3 × 3 stitches around. At a busy two-tone edge (a pattern of fat
   *  black and cream shapes) the ordinary vote is already right, and the extra push would just add noise. */
  inkFieldShare: 0.65,
  /** Share of a footprint that must already show the line color for a one-stitch gap to be closed. */
  bridgeCoverage: 0.05,
  /** A weakly-supported lone stitch in a busy area joins its neighbours when this many of the 4 agree. */
  busyAgree: 3,
  /** Palette colors this close (Lab ΔE) to the dominant one belong to the same field. */
  sameFieldDE: 12,
};

export function stitchify(
  lab: Float32Array,
  workW: number,
  cols: number,
  rows: number,
  block: number,
  palette: Float64Array,
  k: number,
): number[][] {
  // Palette index for every working pixel.
  const idx = new Uint8Array((lab.length / 3) | 0);
  for (let i = 0; i < idx.length; i++) idx[i] = nearestPalette(lab, i * 3, palette, k);

  // Palette votes of every stitch footprint.
  const tally = new Uint16Array(cols * rows * k);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const o = (r * cols + c) * k;
      for (let y = 0; y < block; y++) {
        for (let x = 0; x < block; x++) tally[o + idx[(r * block + y) * workW + c * block + x]]++;
      }
    }
  }

  /** Share of a stitch footprint lying on the way from color `from` to color `to` (see VOTE.ink*). */
  const coverageToward = (r: number, c: number, from: number, to: number): number => {
    const dx = palette[to * 3] - palette[from * 3];
    const dy = palette[to * 3 + 1] - palette[from * 3 + 1];
    const dz = palette[to * 3 + 2] - palette[from * 3 + 2];
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 === 0) return 0;
    let near = 0;
    for (let y = 0; y < block; y++) {
      for (let x = 0; x < block; x++) {
        const q = ((r * block + y) * workW + c * block + x) * 3;
        const ex = lab[q] - palette[from * 3];
        const ey = lab[q + 1] - palette[from * 3 + 1];
        const ez = lab[q + 2] - palette[from * 3 + 2];
        const t = (ex * dx + ey * dy + ez * dz) / len2;
        if (t < VOTE.inkReach || t > 1.15) continue; // beyond p means a more extreme color owns this pixel
        if (Math.hypot(ex - t * dx, ey - t * dy, ez - t * dz) <= VOTE.inkOffLine) near++;
      }
    }
    return near / (block * block);
  };

  const cells: number[][] = [];
  const fieldOf = new Int16Array(cols * rows).fill(-1); // dominant color where the field is calm, else -1
  const around = new Float64Array(k);
  for (let r = 0; r < rows; r++) {
    const row: number[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      // Dominant color of the 3 × 3 stitches around this one (ties go to the lower index).
      around.fill(0);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
          const o = (rr * cols + cc) * k;
          for (let p = 0; p < k; p++) around[p] += tally[o + p];
        }
      }
      let dom = 0;
      let aroundTotal = 0;
      for (let p = 0; p < k; p++) aroundTotal += around[p];
      for (let p = 1; p < k; p++) if (around[p] > around[dom]) dom = p;
      // Near-identical palette colors (pale tints of the same background) count as one field.
      let fieldVotes = 0;
      for (let p = 0; p < k; p++) if (p === dom || deltaE(palette, p * 3, palette, dom * 3) <= VOTE.sameFieldDE) fieldVotes += around[p];
      const calmField = fieldVotes >= VOTE.inkFieldShare * aroundTotal;

      const o = (r * cols + c) * k;
      let best = 0;
      let bestScore = -1;
      for (let p = 0; p < k; p++) {
        const votes = tally[o + p];
        if (votes === 0) continue;
        const contrast =
          p === dom
            ? 0
            : Math.min(
                1,
                Math.max(
                  deltaE(palette, p * 3, palette, dom * 3) / VOTE.fullDE,
                  Math.hypot(palette[p * 3 + 1] - palette[dom * 3 + 1], palette[p * 3 + 2] - palette[dom * 3 + 2]) /
                    VOTE.fullChroma,
                ),
              );
        const score = votes * (1 + VOTE.boost * contrast);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      row[c] = best;
      fieldOf[r * cols + c] = calmField ? dom : -1;
    }
    cells.push(row);
  }

  // Thin-line coverage. A line thinner than a stitch is drawn with a few pure pixels and a fringe of
  // anti-aliased ones that the nearest-color vote hands to pale in-between palette colors. For stitches in a
  // calm field, measure how much of the footprint lies on the way from the dominant color to the strongly
  // contrasting color present there, and let the stitch take that color if it really fills a good part of it.
  // A stitch right beside a stitch that already won that color by plain vote is left alone: that is a
  // stroke at least a stitch wide (lettering, a flat shape), which needs no help and would only be thickened.
  const plain = cells.map((row) => row.slice());
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dom = fieldOf[r * cols + c];
      if (dom < 0) continue; // not a calm field
      const o = (r * cols + c) * k;
      let best = plain[r][c];
      let bestScore = -1;
      for (let p = 0; p < k; p++) {
        if (p === dom || tally[o + p] === 0) continue;
        const dx = palette[p * 3] - palette[dom * 3];
        const dy = palette[p * 3 + 1] - palette[dom * 3 + 1];
        const dz = palette[p * 3 + 2] - palette[dom * 3 + 2];
        const len2 = dx * dx + dy * dy + dz * dz;
        if (Math.sqrt(len2) < VOTE.inkContrast * VOTE.fullDE) continue;
        // A pale in-between color on the way to a stronger color that is also present here is just the
        // anti-aliased fringe of that stronger color; the stronger color is the one to measure.
        let fringe = false;
        for (let q = 0; q < k && !fringe; q++) {
          if (q === dom || q === p || tally[o + q] === 0) continue;
          const qx = palette[q * 3] - palette[dom * 3];
          const qy = palette[q * 3 + 1] - palette[dom * 3 + 1];
          const qz = palette[q * 3 + 2] - palette[dom * 3 + 2];
          const ql2 = qx * qx + qy * qy + qz * qz;
          if (ql2 > len2 && (qx * dx + qy * dy + qz * dz) / Math.sqrt(ql2 * len2) >= 0.9) fringe = true;
        }
        if (fringe) continue;
        if (
          (r > 0 && plain[r - 1][c] === p) ||
          (r < rows - 1 && plain[r + 1][c] === p) ||
          (c > 0 && plain[r][c - 1] === p) ||
          (c < cols - 1 && plain[r][c + 1] === p)
        ) continue;
        const cov = coverageToward(r, c, dom, p);
        const near = cov * block * block;
        const contrast = Math.min(1, Math.sqrt(len2) / VOTE.fullDE);
        const score = Math.max(tally[o + p], near) * (1 + VOTE.inkBoost * contrast);
        if (score > bestScore && cov * (1 + VOTE.inkBoost * contrast) > 1 - cov) {
          bestScore = score;
          best = p;
        }
      }
      cells[r][c] = best;
    }
  }

  // Busy areas (hatching, petals, lettering strokes finer than a stitch) produce stitches that won their vote
  // with less than half of their footprint and have no neighbour of their own color. Those are noise rather
  // than shape; give them to the color most of their neighbours already have. Stitches in calm fields (a
  // thin line on a plain background, an eye in fur) are never touched, and neither is a stitch that owns
  // most of its footprint.
  const busy = cells.map((row) => row.slice());
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (fieldOf[r * cols + c] >= 0) continue;
      const v = busy[r][c];
      if (tally[(r * cols + c) * k + v] * 2 > block * block) continue;
      const nb = [busy[r - 1][c], busy[r + 1][c], busy[r][c - 1], busy[r][c + 1]];
      if (nb.includes(v)) continue;
      for (const q of nb) {
        if (nb.filter((x) => x === q).length >= VOTE.busyAgree) {
          cells[r][c] = q;
          break;
        }
      }
    }
  }

  // Close one-stitch gaps in thin lines. A line that wanders across the stitch grid can clip the corner of
  // a stitch too little to win its vote and leave a hole. Two line-colored stitches two apart (straight or
  // a knight's move) with no line-colored stitch between them get that gap filled, but only in a calm field,
  // only on a background stitch, and only if the picture itself shows some of that line color there
  // (VOTE.bridgeCoverage). A one-stitch gap between two parallel lines has no such coverage and stays open,
  // so nothing is invented.
  const snapshot = cells.map((row) => row.slice());
  const isField = (r: number, c: number): boolean => {
    const f = fieldOf[r * cols + c];
    return f >= 0 && deltaE(palette, snapshot[r][c] * 3, palette, f * 3) <= VOTE.sameFieldDE;
  };
  const strong = (a: number, b: number) => deltaE(palette, a * 3, palette, b * 3) >= VOTE.inkContrast * VOTE.fullDE;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = snapshot[r][c];
      for (const [dr, dc] of [[2, -1], [2, 0], [2, 1], [-1, 2], [0, 2], [1, 2]] as const) {
        const r2 = r + dr;
        const c2 = c + dc;
        if (r2 < 0 || r2 >= rows || c2 < 0 || c2 >= cols) continue;
        const b = snapshot[r2][c2];
        // Candidate stitches in between: those within one step of both ends.
        let linked = false;
        let pick = -1;
        let pickCov = 0;
        let pickColor = a;
        for (let rr = Math.min(r, r2); rr <= Math.max(r, r2); rr++) {
          for (let cc = Math.min(c, c2); cc <= Math.max(c, c2); cc++) {
            if ((rr === r && cc === c) || (rr === r2 && cc === c2)) continue;
            if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) > 1 || Math.max(Math.abs(rr - r2), Math.abs(cc - c2)) > 1) continue;
            if (snapshot[rr][cc] === a || snapshot[rr][cc] === b) {
              linked = true;
              continue;
            }
            // Both ends must be line colors against this background (they may be two shades of one line).
            if (!isField(rr, cc) || !strong(a, snapshot[rr][cc]) || !strong(b, snapshot[rr][cc])) continue;
            const fill = deltaE(palette, a * 3, palette, snapshot[rr][cc] * 3) >= deltaE(palette, b * 3, palette, snapshot[rr][cc] * 3) ? a : b;
            const cov = coverageToward(rr, cc, snapshot[rr][cc], fill);
            if (cov > pickCov) {
              pickCov = cov;
              pick = rr * cols + cc;
              pickColor = fill;
            }
          }
        }
        if (!linked && pick >= 0 && pickCov >= VOTE.bridgeCoverage) cells[(pick / cols) | 0][pick % cols] = pickColor;
      }
    }
  }
  return cells;
}

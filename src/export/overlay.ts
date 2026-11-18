import type { ExportOverlaySettings } from '../state/types';

export const OVERLAY_CREDIT_TEXT = 'made with phase-viz  /  waveform.7g3.net';

const OVERLAY_FONT_STACK = [
  '"Helvetica Neue"',
  'Arial',
  '"Hiragino Sans"',
  '"Hiragino Kaku Gothic ProN"',
  '"Noto Sans JP"',
  '"Yu Gothic"',
  'Meiryo',
  'sans-serif',
].join(', ');

export function hasVisibleOverlay(overlay: ExportOverlaySettings | null | undefined): overlay is ExportOverlaySettings {
  return Boolean(overlay && (overlay.title.trim() || overlay.artist.trim() || overlay.showCredit));
}

/**
 * Draws the title / artist / credit block onto a 2D context sized to the output frame.
 *
 * Layout is relative to the short side so 1080x1920 and 1920x1080 get the same type size.
 * In portrait the block sits at ~12% from the top: below the platform UI at the very top
 * and away from the caption / action-button area that Shorts, Reels and TikTok put at the
 * bottom and right edge. The text is fully visible from the first frame because platforms
 * often use that frame as the thumbnail.
 */
export function drawExportOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: ExportOverlaySettings,
) {
  const title = overlay.title.trim();
  const artist = overlay.artist.trim();
  if (!title && !artist && !overlay.showCredit) return;

  const unit = Math.min(width, height);
  const portrait = height > width;
  const left = width * (portrait ? 0.08 : 0.05);
  const maxWidth = width * (portrait ? 0.74 : 0.6);
  let y = height * (portrait ? 0.12 : 0.09);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = unit * 0.018;

  if (title) {
    const size = fitFontSize(ctx, title, 700, unit * 0.064, unit * 0.036, maxWidth);
    ctx.globalAlpha = 1;
    setLetterSpacing(ctx, `${(size * 0.01).toFixed(2)}px`);
    ctx.font = `700 ${size}px ${OVERLAY_FONT_STACK}`;
    ctx.fillText(title, left, y, maxWidth);
    y += size * 1.22;
  }

  if (artist) {
    const size = fitFontSize(ctx, artist, 500, unit * 0.034, unit * 0.024, maxWidth);
    ctx.globalAlpha = 0.82;
    setLetterSpacing(ctx, `${(size * 0.08).toFixed(2)}px`);
    ctx.font = `500 ${size}px ${OVERLAY_FONT_STACK}`;
    ctx.fillText(artist, left, y, maxWidth);
    y += size * 1.5;
  }

  if (overlay.showCredit) {
    const size = unit * 0.024;
    if (title || artist) {
      y += unit * 0.008;
      ctx.globalAlpha = 0.4;
      ctx.shadowBlur = 0;
      ctx.fillRect(left, y, unit * 0.04, Math.max(1, unit * 0.0016));
      ctx.shadowBlur = unit * 0.018;
      y += unit * 0.02;
    }
    ctx.globalAlpha = 0.7;
    setLetterSpacing(ctx, `${(size * 0.06).toFixed(2)}px`);
    ctx.font = `500 ${size}px ${OVERLAY_FONT_STACK}`;
    ctx.fillText(OVERLAY_CREDIT_TEXT, left, y, maxWidth);
  }

  ctx.restore();
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  preferred: number,
  minimum: number,
  maxWidth: number,
) {
  ctx.font = `${weight} ${preferred}px ${OVERLAY_FONT_STACK}`;
  const measured = ctx.measureText(text).width;
  if (measured <= maxWidth) return preferred;
  return Math.max(minimum, preferred * (maxWidth / measured));
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  // letterSpacing is not available in every canvas implementation; skip it where missing.
  const target = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in target) target.letterSpacing = value;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXPORT_FILE_NAME, triggerBlobDownload } from './download';

afterEach(() => vi.unstubAllGlobals());

describe('triggerBlobDownload', () => {
  it('starts a hidden download and removes its link on the next animation frame', () => {
    const anchor = {
      href: '',
      download: '',
      rel: '',
      style: { display: '' },
      click: vi.fn(),
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    let cleanup: FrameRequestCallback | undefined;
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild } });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      cleanup = callback;
      return 1;
    });

    triggerBlobDownload('blob:recording');

    expect(anchor.href).toBe('blob:recording');
    expect(anchor.download).toBe(DEFAULT_EXPORT_FILE_NAME);
    expect(anchor.rel).toBe('noopener');
    expect(anchor.style.display).toBe('none');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).not.toHaveBeenCalled();

    expect(cleanup).toBeTypeOf('function');
    cleanup?.(0);
    expect(anchor.remove).toHaveBeenCalledOnce();
  });

  it('uses a caller-provided filename', () => {
    const anchor = { href: '', download: '', rel: '', style: { display: '' }, click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } });
    vi.stubGlobal('requestAnimationFrame', vi.fn());

    triggerBlobDownload('blob:recording', 'concert.mp4');

    expect(anchor.download).toBe('concert.mp4');
  });
});

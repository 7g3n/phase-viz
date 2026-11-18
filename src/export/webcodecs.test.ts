import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseWebCodecsMP4 } from './webcodecs';

afterEach(() => vi.unstubAllGlobals());

describe('canUseWebCodecsMP4', () => {
  it('requires both video and audio encoder support checks', () => {
    vi.stubGlobal('VideoEncoder', { isConfigSupported: vi.fn() });
    vi.stubGlobal('VideoFrame', class {});
    vi.stubGlobal('AudioEncoder', { isConfigSupported: vi.fn() });
    vi.stubGlobal('AudioData', class {});

    expect(canUseWebCodecsMP4()).toBe(true);

    vi.stubGlobal('AudioEncoder', {});
    expect(canUseWebCodecsMP4()).toBe(false);

    vi.stubGlobal('AudioEncoder', { isConfigSupported: vi.fn() });
    vi.stubGlobal('VideoFrame', undefined);
    expect(canUseWebCodecsMP4()).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerService, type CameraState } from '../src/services/scanner';
import { cameraRegion } from '../src/core/camera-region';

const mocks = vi.hoisted(() => ({ decode: vi.fn(), stop: vi.fn() }));
vi.mock('../src/services/decoder', () => ({
  LocalDecoder: class {
    decode = mocks.decode;
    stop = mocks.stop;
  },
}));
let service: ScannerService;
let state: CameraState;
let scan: ReturnType<typeof vi.fn<(raw: string) => Promise<void>>>;
let draw: ReturnType<typeof vi.fn>;
let video: HTMLVideoElement;
const value = [{ text: 'ML12345', format: 'DataMatrix' }];
beforeEach(async () => {
  vi.useFakeTimers();
  mocks.decode.mockReset().mockResolvedValue(value);
  draw = vi.fn();
  scan = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('window', { isSecureContext: true });
  const track = { stop: vi.fn(), getCapabilities: () => ({}) };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: async () => ({
        getVideoTracks: () => [track],
        getTracks: () => [track],
      }),
      enumerateDevices: async () => [],
    },
  });
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ drawImage: draw, getImageData: () => ({}) }),
    }),
  });
  video = {
    play: async () => {},
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    clientWidth: 400,
    clientHeight: 300,
  } as unknown as HTMLVideoElement;
  service = new ScannerService(scan, (next) => {
    state = next;
  });
  await service.start(video, '');
});
afterEach(() => {
  service.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('intentional camera capture', () => {
  it('also passes only the cropped canvas to the native detector', async () => {
    const detect = vi
      .fn()
      .mockResolvedValue([{ rawValue: 'MPL012', format: 'data_matrix' }]);
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        static getSupportedFormats = async () => ['data_matrix'];
        detect = detect;
      },
    );
    await service.start(video, '');
    service.requestRead();
    await vi.advanceTimersByTimeAsync(300);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(detect.mock.calls[0][0]).toMatchObject({ width: 460, height: 288 });
    expect(scan).toHaveBeenCalledWith('MPL012');
    expect(mocks.decode).not.toHaveBeenCalled();
  });
  it('does not decode while aiming; each press consumes exactly one reading', async () => {
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.decode).not.toHaveBeenCalled();
    service.requestRead();
    service.requestRead();
    await vi.advanceTimersByTimeAsync(2000);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(state.armed).toBe(false);
    // Even the same code requires another intentional press (then duplicate rules apply).
    service.requestRead();
    await vi.advanceTimersByTimeAsync(200);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[0].slice(1, 5)).toEqual([90, 96, 460, 288]);
  });
  it.each(['cancel', 'timeout', 'stop', 'mode'] as const)(
    'discards late decoder results after %s',
    async (reason) => {
      let finish!: (v: typeof value) => void;
      mocks.decode.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      service.requestRead();
      await vi.advanceTimersByTimeAsync(200);
      if (reason === 'cancel') service.cancelRead();
      if (reason === 'stop') service.stop();
      if (reason === 'timeout') await vi.advanceTimersByTimeAsync(5000);
      if (reason === 'mode') service.setCapture('continuous');
      finish(value);
      await vi.advanceTimersByTimeAsync(0);
      expect(scan).not.toHaveBeenCalled();
      expect(state.armed).toBe(false);
    },
  );
  it('expires empty/ambiguous attempts and does not read until another press', async () => {
    mocks.decode.mockResolvedValue([
      ...value,
      { text: 'MPC123', format: 'DataMatrix' },
    ]);
    service.requestRead();
    await vi.advanceTimersByTimeAsync(5100);
    expect(state.message).toContain('Tempo esgotado');
    mocks.decode.mockResolvedValue(value);
    await vi.advanceTimersByTimeAsync(1000);
    expect(scan).not.toHaveBeenCalled();
  });
  it('continuous mode scans without pressing and retains its latch across a confirmation pause', async () => {
    service.setCapture('continuous');
    await vi.advanceTimersByTimeAsync(1000);
    expect(scan).toHaveBeenCalledTimes(1);
    service.stop();
    await service.start(video, '');
    await vi.advanceTimersByTimeAsync(1000);
    expect(scan).toHaveBeenCalledTimes(1);
    mocks.decode.mockResolvedValue([{ text: 'MPC123', format: 'DataMatrix' }]);
    await vi.advanceTimersByTimeAsync(200);
    expect(scan).toHaveBeenCalledTimes(2);
  });
  it('discards a result decoded before a viewport rotation', async () => {
    let finish!: (v: typeof value) => void;
    mocks.decode.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    service.requestRead();
    await vi.advanceTimersByTimeAsync(200);
    Object.assign(video, { clientWidth: 300, clientHeight: 500 });
    finish(value);
    await vi.advanceTimersByTimeAsync(0);
    expect(scan).not.toHaveBeenCalled();
  });
});
describe('reticle mapping', () => {
  it.each([
    [640, 480, 390, 220],
    [1920, 1080, 400, 500],
    [720, 1280, 500, 300],
  ])('maps the exact crop through letterboxing for %j', (vw, vh, w, h) => {
    const r = cameraRegion(vw, vh, w, h)!;
    const scale = Math.min(w / vw, h / vh);
    expect((r.left - (w - vw * scale) / 2) / scale).toBeCloseTo(r.sx);
    expect((r.top - (h - vh * scale) / 2) / scale).toBeCloseTo(r.sy);
    expect(r.left + r.width).toBeLessThanOrEqual(w);
    expect(r.top + r.height).toBeLessThanOrEqual(h);
  });
});

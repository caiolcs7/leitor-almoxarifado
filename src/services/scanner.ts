import { ScanGate } from '../core/scan-gate';
import { cleanText } from '../core/parser';
import { LocalDecoder, type Decoded } from './decoder';

type CameraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
};
type NativeDetector = {
  detect(
    source: HTMLCanvasElement,
  ): Promise<{ rawValue: string; format: string }[]>;
};
type DetectorConstructor = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};
export type CameraState = {
  running: boolean;
  message: string;
  engine: string;
  torch: boolean;
  zoom?: { min: number; max: number; step: number };
  devices: MediaDeviceInfo[];
};
export class ScannerService {
  private stream: MediaStream | null = null;
  private decoder = new LocalDecoder();
  private gate = new ScanGate();
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private native: NativeDetector | null = null;
  private nativeErrors = 0;
  private missedFrames = 0;
  private track: MediaStreamTrack | undefined;
  private state: CameraState = {
    running: false,
    message: 'Câmera pausada',
    engine: 'ZXing-C++',
    torch: false,
    devices: [],
  };
  constructor(
    private onScan: (raw: string) => Promise<void>,
    private onState: (state: CameraState) => void,
  ) {}
  async start(video: HTMLVideoElement, cameraId: string, autoTorch = false) {
    this.stop();
    const generation = this.generation;
    this.publish({ message: 'Preparando câmera…' });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'A câmera precisa de HTTPS ou localhost. Use leitor físico ou entrada manual.',
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(cameraId
            ? { deviceId: { exact: cameraId } }
            : { facingMode: { ideal: 'environment' } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      await video.play();
      if (generation !== this.generation) return;
      const caps: CameraCapabilities = this.track.getCapabilities?.() ?? {};
      if (caps.focusMode?.includes('continuous'))
        await this.constraint({ focusMode: 'continuous' }).catch(() => {});
      const Detector = (
        globalThis as typeof globalThis & {
          BarcodeDetector?: DetectorConstructor;
        }
      ).BarcodeDetector;
      if (Detector) {
        try {
          const formats = await Detector.getSupportedFormats();
          if (formats.includes('data_matrix'))
            this.native = new Detector({
              formats: [
                'data_matrix',
                'qr_code',
                'code_128',
                'code_39',
                'itf',
              ].filter((f) => formats.includes(f)),
            });
        } catch {
          this.native = null;
        }
      }
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'videoinput',
      );
      if (generation !== this.generation) return;
      if (autoTorch && caps.torch) await this.setTorch(true).catch(() => {});
      this.publish({
        running: true,
        message: 'Aponte para uma etiqueta',
        engine: this.native ? 'Detector nativo + ZXing' : 'ZXing-C++',
        torch: !!caps.torch,
        zoom: caps.zoom,
        devices,
      });
      this.track.onended = () => {
        this.stop();
        this.publish({
          message:
            'A câmera foi desconectada. Selecione outra e inicie novamente.',
        });
      };
      void this.loop(video, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      this.publish({ message: cameraError(error) });
    }
  }
  private async loop(video: HTMLVideoElement, generation: number) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (generation !== this.generation || !ctx) return;
      try {
        if (video.readyState < 2 || !video.videoWidth) {
          this.timer = setTimeout(() => void tick(), 150);
          return;
        }
        // Preserve enough source detail for the small, dense industrial Data
        // Matrix labels while bounding CPU use on 4K mobile cameras.
        const scale = Math.min(1, 1920 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let values: Decoded[] = [];
        if (this.native) {
          try {
            values = (await this.native.detect(canvas)).map((v) => ({
              text: v.rawValue,
              format: v.format,
            }));
            this.nativeErrors = 0;
          } catch {
            if (++this.nativeErrors >= 3) {
              this.native = null;
              this.publish({ engine: 'ZXing-C++ · fallback' });
            }
          }
        }
        if (!values.length && (!this.native || this.missedFrames % 2 === 0))
          values = await this.decoder.decode(
            ctx.getImageData(0, 0, canvas.width, canvas.height),
          );
        if (generation !== this.generation) return;
        const unique = [...new Set(values.map((v) => v.text))];
        if (unique.length === 1) {
          this.missedFrames = 0;
          if (this.gate.accept(cleanText(unique[0]), Date.now()))
            await this.onScan(unique[0]);
        } else if (unique.length > 1) {
          this.publish({
            message: 'Há várias etiquetas na imagem. Enquadre apenas uma.',
          });
        } else {
          this.gate.absent(Date.now());
          if (++this.missedFrames === 25)
            this.publish({
              message:
                'Aproxime a câmera, melhore a iluminação e mantenha a etiqueta visível.',
            });
        }
      } catch (error) {
        if (generation !== this.generation) return;
        this.stop();
        this.publish({ message: cameraError(error) });
        return;
      }
      if (generation === this.generation)
        this.timer = setTimeout(() => void tick(), 160);
    };
    await tick();
  }
  private publish(change: Partial<CameraState>) {
    this.state = { ...this.state, ...change };
    this.onState(this.state);
  }
  private constraint(values: Record<string, unknown>) {
    return (
      this.track?.applyConstraints({
        advanced: [values as MediaTrackConstraintSet],
      }) ?? Promise.resolve()
    );
  }
  setTorch(enabled: boolean) {
    return this.constraint({ torch: enabled });
  }
  setZoom(value: number) {
    return this.constraint({ zoom: value });
  }
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.decoder.stop();
    this.gate.reset();
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    this.track = undefined;
    this.native = null;
    this.nativeErrors = 0;
    this.missedFrames = 0;
    this.publish({
      running: false,
      message: 'Câmera pausada',
      torch: false,
      zoom: undefined,
    });
  }
}
function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotSupportedError' || error.message === 'Not supported')
      return 'Câmera não suportada neste navegador. Use o leitor físico, uma imagem ou a entrada manual.';
    if (error.name === 'NotAllowedError')
      return 'Permissão de câmera negada. Libere nas configurações do navegador ou use a entrada manual.';
    if (error.name === 'NotFoundError')
      return 'Nenhuma câmera encontrada. Conecte uma câmera ou use o leitor físico.';
    if (error.name === 'NotReadableError')
      return 'Câmera ocupada. Feche outros aplicativos que estejam usando a câmera.';
    if (error.name === 'OverconstrainedError')
      return 'A câmera selecionada não está disponível. Escolha Automática e tente novamente.';
  }
  if (error instanceof Error && error.message === 'Not supported')
    return 'Câmera não suportada neste navegador. Use o leitor físico, uma imagem ou a entrada manual.';
  return error instanceof Error
    ? error.message
    : 'Não foi possível iniciar a câmera. Tente novamente.';
}

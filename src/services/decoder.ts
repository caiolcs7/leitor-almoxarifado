export type Decoded = { text: string; format: string };
export class LocalDecoder {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (values: Decoded[]) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  decode(input: Blob | ImageData): Promise<Decoded[]> {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./decoder.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = ({
        data,
      }: MessageEvent<{ id: number; values?: Decoded[]; error?: string }>) => {
        const task = this.pending.get(data.id);
        if (!task) return;
        clearTimeout(task.timer);
        this.pending.delete(data.id);
        if (data.error) task.reject(new Error(data.error));
        else task.resolve(data.values ?? []);
      };
      this.worker.onerror = () =>
        this.stop(
          'O decodificador não carregou. Reconecte e abra o aplicativo novamente.',
        );
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            'Leitura demorou demais. Tente uma imagem menor ou reinicie a câmera.',
          ),
        );
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, input });
    });
  }
  stop(message = 'Leitura interrompida.') {
    this.worker?.terminate();
    this.worker = null;
    for (const task of this.pending.values()) {
      clearTimeout(task.timer);
      task.reject(new Error(message));
    }
    this.pending.clear();
  }
}
export async function decodeImage(file: File): Promise<Decoded[]> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error('Selecione uma imagem com até 20 MB.');
  if (!/^image\/(png|jpeg|webp|bmp|gif)$/.test(file.type))
    throw new Error('Use uma imagem PNG, JPG, WebP, BMP ou GIF.');
  const decoder = new LocalDecoder();
  try {
    return await decoder.decode(file);
  } finally {
    decoder.stop();
  }
}

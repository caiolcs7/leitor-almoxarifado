export class ScanGate {
  private last = '';
  private lastSeen = 0;
  constructor(private absenceMs = 900) {}
  accept(code: string, now: number): boolean {
    const accepted = code !== this.last;
    this.last = code;
    this.lastSeen = now;
    return accepted;
  }
  absent(now: number) {
    if (now - this.lastSeen >= this.absenceMs) this.last = '';
  }
  reset() {
    this.last = '';
    this.lastSeen = 0;
  }
}

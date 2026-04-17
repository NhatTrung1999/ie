import dns from 'dns';

type NetworkCallback = () => void;

export class NetworkWatcher {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _isOnline = false;
  private readonly onOnline: NetworkCallback;
  private readonly onOffline: NetworkCallback;
  private readonly checkIntervalMs: number;
  private readonly testHost: string;

  constructor(
    onOnline: NetworkCallback,
    onOffline: NetworkCallback,
    checkIntervalMs = 30_000,
    testHost = '8.8.8.8', // Google DNS — nhanh và đáng tin cậy
  ) {
    this.onOnline = onOnline;
    this.onOffline = onOffline;
    this.checkIntervalMs = checkIntervalMs;
    this.testHost = testHost;
  }

  start() {
    // Check ngay lần đầu
    void this.check();

    this.intervalId = setInterval(() => {
      void this.check();
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isOnline(): boolean {
    return this._isOnline;
  }

  private async check(): Promise<void> {
    const wasOnline = this._isOnline;
    this._isOnline = await this.testConnectivity();

    if (!wasOnline && this._isOnline) {
      // Vừa có mạng
      this.onOnline();
    } else if (wasOnline && !this._isOnline) {
      // Vừa mất mạng
      this.onOffline();
    }
  }

  private testConnectivity(): Promise<boolean> {
    return new Promise((resolve) => {
      dns.lookup(this.testHost, (err) => {
        resolve(!err);
      });
    });
  }
}

type NetworkCallback = () => void;
export declare class NetworkWatcher {
    private intervalId;
    private _isOnline;
    private readonly onOnline;
    private readonly onOffline;
    private readonly checkIntervalMs;
    private readonly testHost;
    constructor(onOnline: NetworkCallback, onOffline: NetworkCallback, checkIntervalMs?: number, testHost?: string);
    start(): void;
    stop(): void;
    isOnline(): boolean;
    private check;
    private testConnectivity;
}
export {};

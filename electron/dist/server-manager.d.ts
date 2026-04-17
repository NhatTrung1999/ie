export declare class ServerManager {
    private nestProcess;
    private readonly port;
    private readonly maxRetries;
    constructor(port: number);
    private ensureDatabaseExists;
    start(): Promise<void>;
    stop(): Promise<void>;
    private waitForServerReady;
    isRunning(): boolean;
}

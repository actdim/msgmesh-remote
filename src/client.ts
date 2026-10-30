import {
    type RemoteFrame,
    type FrameCodec,
    type RemoteSocket,
    type RemoteMsgFrame,
} from './types';
import {
    defaultCodec,
    createSubFrame,
    createUnsubFrame,
    createMsgFrame,
    createReqFrame,
    createPingFrame,
    createAuthFrame,
} from './protocol';

export type ClientConnectionState = 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED';

export interface RemoteClientOptions {
    url?: string;
    socketFactory?: () => WebSocket | RemoteSocket;
    token?: string;
    tokenGetter?: () => string | Promise<string>;
    codec?: FrameCodec;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
    minReconnectDelayMs?: number;
    maxReconnectDelayMs?: number;
    maxOfflineQueueSize?: number;
    defaultRequestTimeoutMs?: number;
    logger?: {
        debug?: (msg: string, ...args: unknown[]) => void;
        info?: (msg: string, ...args: unknown[]) => void;
        warn?: (msg: string, ...args: unknown[]) => void;
        error?: (msg: string, ...args: unknown[]) => void;
    };
}

export interface RemoteSubscriptionItem {
    channel: string;
    topic?: string;
    group?: string;
}

export interface RemoteBusBridgeConfig {
    remoteRequests?: string[] | ((channel: string) => boolean);
    sendToRemote?: string[] | ((channel: string) => boolean);
    remoteSubscriptions?: RemoteSubscriptionItem[];
}

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    frame: RemoteFrame;
}

interface PendingAuth {
    resolve: (value: void) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class RemoteMeshClient {
    public readonly codec: FrameCodec;
    private state: ClientConnectionState = 'CLOSED';
    private socket: WebSocket | RemoteSocket | null = null;
    private readonly subscriptions = new Map<string, RemoteSubscriptionItem>();
    private readonly offlineQueue: RemoteMsgFrame[] = [];
    private readonly pendingRequests = new Map<string, PendingRequest>();
    private pendingAuth: PendingAuth | null = null;

    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private isExplicitlyClosed = false;

    private readonly stateListeners = new Set<(state: ClientConnectionState) => void>();
    private readonly messageListeners = new Set<(frame: RemoteMsgFrame) => void>();

    constructor(public readonly options: RemoteClientOptions) {
        this.codec = options.codec || defaultCodec;
    }

    public getState(): ClientConnectionState {
        return this.state;
    }

    public onStateChange(listener: (state: ClientConnectionState) => void): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    public onMessage(listener: (frame: RemoteMsgFrame) => void): () => void {
        this.messageListeners.add(listener);
        return () => this.messageListeners.delete(listener);
    }

    public connect(): void {
        if (this.state === 'OPEN' || this.state === 'CONNECTING') {
            return;
        }

        this.isExplicitlyClosed = false;
        this.setState(this.reconnectAttempts === 0 ? 'CONNECTING' : 'RECONNECTING');

        try {
            if (this.options.socketFactory) {
                this.socket = this.options.socketFactory();
            } else if (this.options.url) {
                if (typeof WebSocket === 'undefined') {
                    throw new Error('Global WebSocket not found. Provide a custom socketFactory in options.');
                }
                this.socket = new WebSocket(this.options.url);
            } else {
                throw new Error('Either url or socketFactory must be provided to RemoteMeshClient.');
            }

            this.wireSocketEvents(this.socket);
        } catch (err) {
            this.options.logger?.error?.('Socket creation failed:', err);
            this.scheduleReconnect();
        }
    }

    private wireSocketEvents(sock: WebSocket | RemoteSocket): void {
        const handleOpen = async () => {
            this.reconnectAttempts = 0;
            this.setState('OPEN');
            this.startHeartbeat();

            // Perform in-band authentication if token or tokenGetter is configured
            const token = this.options.token ?? (await this.options.tokenGetter?.());
            if (token) {
                this.sendRaw(createAuthFrame(token));
            }

            this.resubscribeAll();
            this.flushOfflineQueue();
        };

        const handleMessage = (data: unknown) => {
            try {
                const raw = data instanceof MessageEvent ? data.data : data;
                const frame = this.codec.decode(raw as string | Uint8Array);
                this.handleIncomingFrame(frame);
            } catch (err) {
                this.options.logger?.warn?.('Failed to decode incoming frame:', err);
            }
        };

        const handleClose = () => {
            this.cleanupSocket();
            if (!this.isExplicitlyClosed) {
                this.scheduleReconnect();
            } else {
                this.setState('CLOSED');
            }
        };

        const handleError = (err: unknown) => {
            this.options.logger?.warn?.('Socket encountered error:', err);
        };

        if ('addEventListener' in sock && typeof sock.addEventListener === 'function') {
            sock.addEventListener('open', () => void handleOpen());
            sock.addEventListener('message', handleMessage);
            sock.addEventListener('close', handleClose);
            sock.addEventListener('error', handleError);
        } else if ('on' in sock && typeof sock.on === 'function') {
            sock.on('message', handleMessage);
            sock.on('close', handleClose);
            sock.on('error', handleError);
            void handleOpen();
        }
    }

    private handleIncomingFrame(frame: RemoteFrame): void {
        switch (frame.t) {
            case 'PONG':
                this.clearHeartbeatTimeout();
                break;

            case 'AUTH_OK':
                if (this.pendingAuth) {
                    clearTimeout(this.pendingAuth.timer);
                    this.pendingAuth.resolve();
                    this.pendingAuth = null;
                }
                break;

            case 'AUTH_FAIL':
                if (this.pendingAuth) {
                    clearTimeout(this.pendingAuth.timer);
                    this.pendingAuth.reject(new Error(`[msgmesh-remote] Auth failed: ${frame.error}`));
                    this.pendingAuth = null;
                }
                this.options.logger?.warn?.(`Authentication rejected by server: ${frame.error}`);
                break;

            case 'RES': {
                const pending = this.pendingRequests.get(frame.id);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingRequests.delete(frame.id);
                    if (frame.error !== undefined) {
                        pending.reject(frame.error);
                    } else {
                        pending.resolve(frame.payload);
                    }
                }
                break;
            }

            case 'MSG': {
                for (const listener of this.messageListeners) {
                    try {
                        listener(frame);
                    } catch (err) {
                        this.options.logger?.error?.('Message listener threw an error:', err);
                    }
                }
                break;
            }

            case 'PING':
                this.sendRaw({ t: 'PONG' });
                break;
        }
    }

    public async authenticate(token: string, timeoutMs = 10000): Promise<void> {
        if (this.state !== 'OPEN') {
            throw new Error('[msgmesh-remote] Cannot authenticate while socket is not OPEN');
        }

        return new Promise<void>((resolve, reject) => {
            if (this.pendingAuth) {
                clearTimeout(this.pendingAuth.timer);
                this.pendingAuth.reject(new Error('Superseded by new authentication request'));
            }

            const timer = setTimeout(() => {
                this.pendingAuth = null;
                reject(new Error(`[msgmesh-remote] Authentication timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pendingAuth = { resolve, reject, timer };
            this.sendRaw(createAuthFrame(token));
        });
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        const interval = this.options.heartbeatIntervalMs ?? 15000;
        const timeout = this.options.heartbeatTimeoutMs ?? 5000;

        this.heartbeatTimer = setInterval(() => {
            if (this.state !== 'OPEN') return;

            this.sendRaw(createPingFrame());

            this.heartbeatTimeoutTimer = setTimeout(() => {
                this.options.logger?.warn?.('Heartbeat PONG timeout exceeded; terminating dead socket');
                this.forceSocketTermination();
            }, timeout);
        }, interval);
    }

    private clearHeartbeatTimeout(): void {
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        this.clearHeartbeatTimeout();
    }

    private forceSocketTermination(): void {
        this.cleanupSocket();
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.isExplicitlyClosed) return;

        this.setState('RECONNECTING');
        if (this.reconnectTimer) return;

        this.reconnectAttempts++;
        const minDelay = this.options.minReconnectDelayMs ?? 500;
        const maxDelay = this.options.maxReconnectDelayMs ?? 10000;
        const backoff = Math.min(minDelay * Math.pow(1.5, this.reconnectAttempts - 1), maxDelay);
        const jitter = backoff * (0.8 + Math.random() * 0.4);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, jitter);
    }

    private resubscribeAll(): void {
        for (const sub of this.subscriptions.values()) {
            this.sendRaw(createSubFrame(sub.channel, sub.topic, sub.group));
        }
    }

    private flushOfflineQueue(): void {
        while (this.offlineQueue.length > 0 && this.state === 'OPEN') {
            const frame = this.offlineQueue.shift();
            if (frame) {
                this.sendRaw(frame);
            }
        }
    }

    public subscribe(channel: string, topic?: string, group?: string): void {
        const key = `${channel}::${group ?? ''}::${topic ?? ''}`;
        this.subscriptions.set(key, { channel, topic, group });

        if (this.state === 'OPEN') {
            this.sendRaw(createSubFrame(channel, topic, group));
        }
    }

    public unsubscribe(channel: string, topic?: string, group?: string): void {
        const key = `${channel}::${group ?? ''}::${topic ?? ''}`;
        this.subscriptions.delete(key);

        if (this.state === 'OPEN') {
            this.sendRaw(createUnsubFrame(channel, topic, group));
        }
    }

    public send(channel: string, payload?: unknown, topic?: string, group?: string): void {
        const frame = createMsgFrame(channel, payload, topic, group);

        if (this.state === 'OPEN') {
            this.sendRaw(frame);
        } else {
            const maxQueue = this.options.maxOfflineQueueSize ?? 200;
            if (this.offlineQueue.length < maxQueue) {
                this.offlineQueue.push(frame);
            } else {
                this.options.logger?.warn?.('Offline message queue limit reached; dropping message');
            }
        }
    }

    public async request<T = unknown>(
        channel: string,
        payload?: unknown,
        options?: { topic?: string; group?: string; timeout?: number },
    ): Promise<T> {
        const id = `req-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
        const timeoutMs = options?.timeout ?? this.options.defaultRequestTimeoutMs ?? 10000;
        const frame = createReqFrame(id, channel, payload, options?.topic, options?.group);

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`[msgmesh-remote] Request timeout after ${timeoutMs}ms (channel: ${channel})`));
            }, timeoutMs);

            this.pendingRequests.set(id, {
                resolve: resolve as (val: unknown) => void,
                reject,
                timer,
                frame,
            });

            if (this.state === 'OPEN') {
                this.sendRaw(frame);
            }
        });
    }

    private sendRaw(frame: RemoteFrame): void {
        try {
            const data = this.codec.encode(frame);
            if (this.socket) {
                this.socket.send(data);
            }
        } catch (err) {
            this.options.logger?.error?.('Failed to send raw frame:', err);
        }
    }

    private cleanupSocket(): void {
        this.stopHeartbeat();
        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                // ignore close errors
            }
            this.socket = null;
        }
    }

    private setState(next: ClientConnectionState): void {
        if (this.state !== next) {
            this.state = next;
            for (const listener of this.stateListeners) {
                try {
                    listener(next);
                } catch (err) {
                    this.options.logger?.error?.('State listener threw error:', err);
                }
            }
        }
    }

    public close(): void {
        this.isExplicitlyClosed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.pendingAuth) {
            clearTimeout(this.pendingAuth.timer);
            this.pendingAuth.reject(new Error('[msgmesh-remote] Client connection closed'));
            this.pendingAuth = null;
        }
        for (const req of this.pendingRequests.values()) {
            clearTimeout(req.timer);
            req.reject(new Error('[msgmesh-remote] Client connection closed'));
        }
        this.pendingRequests.clear();
        this.offlineQueue.length = 0;
        this.cleanupSocket();
        this.setState('CLOSED');
    }

    /**
     * High-level declarative bridge between in-memory MsgBus and RemoteMeshClient.
     */
    public attachToBus(bus: any, options?: RemoteBusBridgeConfig): () => void {
        return bridgeRemoteBus(bus, this, options);
    }
}

/**
 * Connects an in-memory MsgBus with a RemoteMeshClient declaratively.
 */
export function bridgeRemoteBus(
    bus: any,
    client: RemoteMeshClient,
    config?: RemoteBusBridgeConfig,
): () => void {
    // 1. Subscribe to remote events specified in config
    if (config?.remoteSubscriptions) {
        for (const sub of config.remoteSubscriptions) {
            client.subscribe(sub.channel, sub.topic, sub.group);
        }
    }

    // 2. Forward incoming remote MSG frames into local bus
    const unsubIncoming = client.onMessage((frame) => {
        if (typeof bus?.send === 'function') {
            void bus.send({
                channel: frame.channel,
                group: frame.group,
                topic: frame.topic,
                payload: frame.payload,
            });
        }
    });

    // 3. Register request providers on local bus
    const providers: Array<() => void> = [];
    if (typeof bus?.provide === 'function' && Array.isArray(config?.remoteRequests)) {
        for (const channel of config.remoteRequests) {
            const unsubProvider = bus.provide({
                channel,
                callback: async (inMsg: any) => {
                    const topic = inMsg?.address?.topic || inMsg?.topic;
                    const group = inMsg?.address?.group || inMsg?.group;
                    return client.request(channel, inMsg?.payload, { topic, group });
                },
            });
            if (typeof unsubProvider === 'function') {
                providers.push(unsubProvider);
            }
        }
    }

    return () => {
        unsubIncoming();
        for (const p of providers) p();
        if (config?.remoteSubscriptions) {
            for (const sub of config.remoteSubscriptions) {
                client.unsubscribe(sub.channel, sub.topic, sub.group);
            }
        }
    };
}

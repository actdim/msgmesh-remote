import {
    type RemoteFrame,
    type RemoteSocket,
    type FrameCodec,
    type RemoteSubFrame,
    type RemoteUnsubFrame,
    type RemoteMsgFrame,
    type RemoteReqFrame,
} from './types';
import {
    defaultCodec,
    createResFrame,
    createPongFrame,
    createMsgFrame,
} from './protocol';

export interface RemoteConnectionContext {
    connectionId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

export interface RemoteServerOptions {
    bus: any;
    codec?: FrameCodec;
    authorize?: (context: RemoteConnectionContext, frame: RemoteFrame) => boolean | Promise<boolean>;
    logger?: {
        debug?: (msg: string, ...args: unknown[]) => void;
        info?: (msg: string, ...args: unknown[]) => void;
        warn?: (msg: string, ...args: unknown[]) => void;
        error?: (msg: string, ...args: unknown[]) => void;
    };
}

export class RemoteClientSession {
    public readonly context: RemoteConnectionContext;
    private readonly subscriptions = new Set<string>();
    private readonly busSubscriptions = new Map<string, () => void>();
    private isClosed = false;

    constructor(
        public readonly socket: RemoteSocket,
        context: Partial<RemoteConnectionContext> | undefined,
        private readonly server: RemoteMeshServer,
        private readonly codec: FrameCodec,
    ) {
        this.context = {
            connectionId: context?.connectionId || `conn-${Math.random().toString(36).slice(2, 10)}`,
            userId: context?.userId,
            metadata: context?.metadata,
        };
    }

    public send(frame: RemoteFrame): void {
        if (this.isClosed) return;
        try {
            const encoded = this.codec.encode(frame);
            this.socket.send(encoded);
        } catch (err) {
            this.server.options.logger?.error?.('Failed to send frame to socket:', err);
        }
    }

    public isSubscribed(channel: string, topic?: string): boolean {
        if (this.subscriptions.has(channel)) {
            return true;
        }
        if (topic && this.subscriptions.has(`${channel}::${topic}`)) {
            return true;
        }
        return false;
    }

    public async handleFrame(frame: RemoteFrame): Promise<void> {
        if (this.server.options.authorize) {
            const allowed = await this.server.options.authorize(this.context, frame);
            if (!allowed) {
                if (frame.t === 'REQ') {
                    this.send(createResFrame(frame.id, undefined, { message: 'Unauthorized', code: 403 }));
                }
                return;
            }
        }

        switch (frame.t) {
            case 'PING':
                this.send(createPongFrame());
                break;

            case 'SUB':
                this.handleSub(frame);
                break;

            case 'UNSUB':
                this.handleUnsub(frame);
                break;

            case 'MSG':
                this.handleMsg(frame);
                break;

            case 'REQ':
                await this.handleReq(frame);
                break;

            case 'PONG':
            case 'RES':
                // Client-side frames received on server; ignored or logged
                break;
        }
    }

    private handleSub(frame: RemoteSubFrame): void {
        const key = frame.topic ? `${frame.channel}::${frame.topic}` : frame.channel;
        this.subscriptions.add(key);

        // Bind listener on server bus if not already registered for this channel
        if (!this.busSubscriptions.has(frame.channel)) {
            const abortController = new AbortController();
            const bus = this.server.options.bus;

            if (typeof bus?.on === 'function') {
                bus.on({
                    channel: frame.channel,
                    options: { abortSignal: abortController.signal },
                    callback: (msg: any) => {
                        const msgTopic = msg?.address?.topic || msg?.topic;
                        if (this.isSubscribed(frame.channel, msgTopic)) {
                            this.send(createMsgFrame(frame.channel, msg?.payload ?? msg, msgTopic));
                        }
                    },
                });

                this.busSubscriptions.set(frame.channel, () => {
                    abortController.abort();
                });
            }
        }
    }

    private handleUnsub(frame: RemoteUnsubFrame): void {
        const key = frame.topic ? `${frame.channel}::${frame.topic}` : frame.channel;
        this.subscriptions.delete(key);

        // If no more subscriptions exist for this channel, unsubscribe from bus
        let hasRemainingForChannel = false;
        for (const sub of this.subscriptions) {
            if (sub === frame.channel || sub.startsWith(`${frame.channel}::`)) {
                hasRemainingForChannel = true;
                break;
            }
        }

        if (!hasRemainingForChannel) {
            const unsub = this.busSubscriptions.get(frame.channel);
            if (unsub) {
                unsub();
                this.busSubscriptions.delete(frame.channel);
            }
        }
    }

    private handleMsg(frame: RemoteMsgFrame): void {
        const bus = this.server.options.bus;
        if (typeof bus?.send === 'function') {
            void bus.send({
                channel: frame.channel,
                topic: frame.topic,
                payload: frame.payload,
            });
        }
    }

    private async handleReq(frame: RemoteReqFrame): Promise<void> {
        const bus = this.server.options.bus;
        if (!bus || typeof bus.request !== 'function') {
            this.send(createResFrame(frame.id, undefined, { message: 'Server bus has no request provider' }));
            return;
        }

        try {
            const response = await bus.request({
                channel: frame.channel,
                topic: frame.topic,
                payload: frame.payload,
            });
            const payload = response?.payload !== undefined ? response.payload : response;
            this.send(createResFrame(frame.id, payload));
        } catch (err: unknown) {
            const errorPayload = err instanceof Error
                ? { message: err.message, name: err.name, ...(err as any) }
                : (typeof err === 'object' && err !== null ? err : { message: String(err) });
            this.send(createResFrame(frame.id, undefined, errorPayload));
        }
    }

    public close(): void {
        if (this.isClosed) return;
        this.isClosed = true;

        for (const unsub of this.busSubscriptions.values()) {
            try {
                unsub();
            } catch {
                // ignore cleanup errors
            }
        }
        this.busSubscriptions.clear();
        this.subscriptions.clear();
    }
}

export class RemoteMeshServer {
    public readonly codec: FrameCodec;
    private readonly sessions = new Set<RemoteClientSession>();

    constructor(public readonly options: RemoteServerOptions) {
        this.codec = options.codec || defaultCodec;
    }

    public handleConnection(
        socket: RemoteSocket,
        context?: Partial<RemoteConnectionContext>,
    ): RemoteClientSession {
        const session = new RemoteClientSession(socket, context, this, this.codec);
        this.sessions.add(session);

        socket.on('message', (raw: unknown) => {
            try {
                const frame = this.codec.decode(raw as string | Uint8Array);
                void session.handleFrame(frame);
            } catch (err) {
                this.options.logger?.warn?.('Failed to parse frame from client socket:', err);
            }
        });

        const cleanup = () => {
            session.close();
            this.sessions.delete(session);
        };

        socket.on('close', cleanup);
        socket.on('error', cleanup);

        return session;
    }

    public broadcast(channel: string, payload?: unknown, topic?: string): void {
        const frame = createMsgFrame(channel, payload, topic);
        for (const session of this.sessions) {
            if (session.isSubscribed(channel, topic)) {
                session.send(frame);
            }
        }
    }

    public get activeSessionsCount(): number {
        return this.sessions.size;
    }

    public close(): void {
        for (const session of this.sessions) {
            session.close();
            try {
                session.socket.close();
            } catch {
                // ignore close errors
            }
        }
        this.sessions.clear();
    }
}

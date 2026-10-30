import {
    type RemoteFrame,
    type RemoteSocket,
    type FrameCodec,
    type RemoteSubFrame,
    type RemoteUnsubFrame,
    type RemoteMsgFrame,
    type RemoteReqFrame,
    type RemoteAuthFrame,
    type RemoteServerBusLike,
} from './types';

export type { RemoteSocket, RemoteFrame, RemoteServerBusLike };
import {
    defaultCodec,
    createResFrame,
    createPongFrame,
    createMsgFrame,
    createAuthOkFrame,
    createAuthFailFrame,
} from './protocol';

export interface RemoteConnectionContext {
    connectionId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

export interface RemoteServerOptions<
    TChannel extends string = string,
    TGroup extends string = string,
> {
    bus: RemoteServerBusLike<TChannel, TGroup>;
    codec?: FrameCodec;
    resolveChannels?: (channelPattern: string) => TChannel[];
    onAuthenticate?: (
        token: string,
        context: RemoteConnectionContext,
    ) => Promise<{ userId?: string; metadata?: Record<string, unknown> } | boolean | null> | { userId?: string; metadata?: Record<string, unknown> } | boolean | null;
    authorize?: (context: RemoteConnectionContext, frame: RemoteFrame<TChannel>) => boolean | Promise<boolean>;
    filterEvent?: (
        context: RemoteConnectionContext,
        channel: string,
        payload: unknown,
        topic?: string,
        group?: string,
    ) => boolean;
    logger?: {
        debug?: (msg: string, ...args: unknown[]) => void;
        info?: (msg: string, ...args: unknown[]) => void;
        warn?: (msg: string, ...args: unknown[]) => void;
        error?: (msg: string, ...args: unknown[]) => void;
    };
}

interface SubscriptionRecord<TChannel extends string = string> {
    channel: TChannel;
    group?: string;
    topic?: string;
}

function matchChannelPattern(pattern: string, channel: string): boolean {
    if (pattern === '*' || pattern === channel) return true;
    if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return channel.startsWith(prefix);
    }
    return false;
}

function matchTopicPattern(pattern?: string, topic?: string): boolean {
    if (!pattern || pattern === '*') return true;
    return pattern === topic;
}

function matchGroupPattern(pattern?: string, group?: string): boolean {
    if (!pattern || pattern === '*') return true;
    return pattern === group;
}

export class RemoteClientSession<
    TChannel extends string = string,
    TGroup extends string = string,
> {
    public readonly context: RemoteConnectionContext;
    private readonly subscriptions = new Map<string, SubscriptionRecord<TChannel>>();
    private readonly busSubscriptions = new Map<string, () => void>();
    private isClosed = false;

    constructor(
        public readonly socket: RemoteSocket,
        context: Partial<RemoteConnectionContext> | undefined,
        private readonly server: RemoteMeshServer<TChannel, TGroup>,
        private readonly codec: FrameCodec,
    ) {
        this.context = {
            connectionId: context?.connectionId || `conn-${Math.random().toString(36).slice(2, 10)}`,
            userId: context?.userId,
            metadata: context?.metadata,
        };
    }

    public send(frame: RemoteFrame<TChannel>): void {
        if (this.isClosed) return;
        try {
            const encoded = this.codec.encode(frame as RemoteFrame);
            this.socket.send(encoded);
        } catch (err) {
            this.server.options.logger?.error?.('Failed to send frame to socket:', err);
        }
    }

    public isSubscribed(channel: string, topic?: string, group?: string): boolean {
        for (const sub of this.subscriptions.values()) {
            if (
                matchChannelPattern(sub.channel, channel) &&
                matchTopicPattern(sub.topic, topic) &&
                matchGroupPattern(sub.group, group)
            ) {
                return true;
            }
        }
        return false;
    }

    public async handleFrame(frame: RemoteFrame<TChannel>): Promise<void> {
        if (frame.t === 'AUTH') {
            await this.handleAuth(frame);
            return;
        }

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
            case 'AUTH_OK':
            case 'AUTH_FAIL':
                break;
        }
    }

    private async handleAuth(frame: RemoteAuthFrame): Promise<void> {
        if (!this.server.options.onAuthenticate) {
            this.send(createAuthOkFrame(this.context.userId));
            return;
        }

        try {
            const result = await this.server.options.onAuthenticate(frame.token, this.context);
            if (!result) {
                this.send(createAuthFailFrame('Authentication failed', 401));
                return;
            }

            if (typeof result === 'object' && result !== null) {
                if (result.userId) {
                    this.context.userId = result.userId;
                }
                if (result.metadata) {
                    this.context.metadata = { ...(this.context.metadata || {}), ...result.metadata };
                }
            }

            this.send(createAuthOkFrame(this.context.userId));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.send(createAuthFailFrame(message || 'Authentication error', 500));
        }
    }

    private handleSub(frame: RemoteSubFrame<TChannel>): void {
        const key = `${frame.channel}::${frame.group ?? ''}::${frame.topic ?? ''}`;
        this.subscriptions.set(key, {
            channel: frame.channel,
            group: frame.group,
            topic: frame.topic,
        });

        const channelsToListen: TChannel[] = this.server.options.resolveChannels
            ? this.server.options.resolveChannels(frame.channel)
            : [frame.channel];

        for (const busChannel of channelsToListen) {
            const subKey = `${busChannel}::${frame.topic ?? ''}`;
            if (!this.busSubscriptions.has(subKey)) {
                const abortController = new AbortController();
                const bus = this.server.options.bus;

                if (typeof bus?.on === 'function') {
                    const busTopic = frame.topic === '*' ? '/.*/' : frame.topic;
                    bus.on({
                        channel: busChannel,
                        topic: busTopic,
                        options: { abortSignal: abortController.signal },
                        callback: (msg) => {
                            const eventChannel = msg?.address?.channel || msg?.channel || busChannel;
                            const eventTopic = msg?.address?.topic || msg?.topic;
                            const eventGroup = msg?.address?.group || msg?.group;
                            const eventPayload = msg?.payload !== undefined ? msg.payload : msg;

                            if (this.isSubscribed(eventChannel, eventTopic, eventGroup)) {
                                if (!this.canReceiveEvent(eventChannel, eventPayload, eventTopic, eventGroup)) {
                                    return;
                                }
                                this.send(createMsgFrame(eventChannel, eventPayload, eventTopic, eventGroup) as RemoteFrame<TChannel>);
                            }
                        },
                    });

                    this.busSubscriptions.set(subKey, () => {
                        abortController.abort();
                    });
                }
            }
        }
    }

    private canReceiveEvent(channel: string, payload: unknown, topic?: string, group?: string): boolean {
        if (this.server.options.filterEvent) {
            return this.server.options.filterEvent(this.context, channel, payload, topic, group);
        }

        if (payload && typeof payload === 'object') {
            const p = payload as Record<string, unknown>;
            const owner = p.userId ?? p.ownerUserId;
            if (owner !== undefined && this.context.userId && String(owner) !== String(this.context.userId)) {
                return false;
            }
        }

        return true;
    }

    private handleUnsub(frame: RemoteUnsubFrame<TChannel>): void {
        const key = `${frame.channel}::${frame.group ?? ''}::${frame.topic ?? ''}`;
        this.subscriptions.delete(key);

        const channelsToUnsub: TChannel[] = this.server.options.resolveChannels
            ? this.server.options.resolveChannels(frame.channel)
            : [frame.channel];

        for (const busChannel of channelsToUnsub) {
            const subKey = `${busChannel}::${frame.topic ?? ''}`;
            let hasRemaining = false;
            for (const sub of this.subscriptions.values()) {
                const activeChannels: TChannel[] = this.server.options.resolveChannels
                    ? this.server.options.resolveChannels(sub.channel)
                    : [sub.channel];

                if (activeChannels.includes(busChannel) && (sub.topic ?? '') === (frame.topic ?? '')) {
                    hasRemaining = true;
                    break;
                }
            }

            if (!hasRemaining) {
                const unsub = this.busSubscriptions.get(subKey);
                if (unsub) {
                    unsub();
                    this.busSubscriptions.delete(subKey);
                }
            }
        }
    }

    private handleMsg(frame: RemoteMsgFrame<TChannel>): void {
        const bus = this.server.options.bus;
        if (typeof bus?.send === 'function') {
            void bus.send({
                channel: frame.channel,
                group: frame.group as TGroup | undefined,
                topic: frame.topic,
                payload: frame.payload,
            });
        }
    }

    private async handleReq(frame: RemoteReqFrame<TChannel>): Promise<void> {
        const bus = this.server.options.bus;
        if (!bus || typeof bus.request !== 'function') {
            this.send(createResFrame(frame.id, undefined, { message: 'Server bus has no request provider' }));
            return;
        }

        try {
            const response = await bus.request({
                channel: frame.channel,
                group: frame.group as TGroup | undefined,
                topic: frame.topic,
                payload: frame.payload,
            });
            const payload = typeof response === 'object' && response !== null && 'payload' in response
                ? (response as { payload?: unknown }).payload
                : response;
            this.send(createResFrame(frame.id, payload));
        } catch (err: unknown) {
            const errObj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};
            const errorPayload = err instanceof Error
                ? { message: err.message, name: err.name, ...errObj }
                : (typeof err === 'object' && err !== null ? errObj : { message: String(err) });
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

export class RemoteMeshServer<
    TChannel extends string = string,
    TGroup extends string = string,
> {
    public readonly codec: FrameCodec;
    private readonly sessions = new Set<RemoteClientSession<TChannel, TGroup>>();

    constructor(public readonly options: RemoteServerOptions<TChannel, TGroup>) {
        this.codec = options.codec || defaultCodec;
    }

    public handleConnection(
        socket: RemoteSocket,
        context?: Partial<RemoteConnectionContext>,
    ): RemoteClientSession<TChannel, TGroup> {
        const session = new RemoteClientSession<TChannel, TGroup>(socket, context, this, this.codec);
        this.sessions.add(session);

        socket.on('message', (raw: unknown) => {
            try {
                const frame = this.codec.decode(raw as string | Uint8Array) as RemoteFrame<TChannel>;
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

    public broadcast(channel: TChannel, payload?: unknown, topic?: string, group?: string): void {
        const frame = createMsgFrame(channel, payload, topic, group);
        for (const session of this.sessions) {
            if (session.isSubscribed(channel, topic, group)) {
                session.send(frame as RemoteFrame<TChannel>);
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

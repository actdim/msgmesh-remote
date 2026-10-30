/**
 * Frame types supported by the @actdim/msgmesh-remote wire protocol.
 */
export type RemoteFrameType =
    | 'SUB'
    | 'UNSUB'
    | 'MSG'
    | 'REQ'
    | 'RES'
    | 'PING'
    | 'PONG'
    | 'AUTH'
    | 'AUTH_OK'
    | 'AUTH_FAIL';

/**
 * Client-to-server subscription request for a channel, group, or topic.
 */
export type RemoteSubFrame<TChannel extends string = string> = {
    t: 'SUB';
    channel: TChannel;
    group?: string;
    topic?: string;
};

/**
 * Client-to-server unsubscription request.
 */
export type RemoteUnsubFrame<TChannel extends string = string> = {
    t: 'UNSUB';
    channel: TChannel;
    group?: string;
    topic?: string;
};

/**
 * One-way fire-and-forget message (both directions).
 */
export type RemoteMsgFrame<TChannel extends string = string, TPayload = unknown> = {
    t: 'MSG';
    channel: TChannel;
    group?: string;
    topic?: string;
    payload?: TPayload;
};

/**
 * Correlated RPC request frame.
 */
export type RemoteReqFrame<TChannel extends string = string, TPayload = unknown> = {
    t: 'REQ';
    id: string;
    channel: TChannel;
    group?: string;
    topic?: string;
    payload?: TPayload;
};

/**
 * Correlated RPC response frame.
 */
export type RemoteResFrame<TPayload = unknown, TError = unknown> = {
    t: 'RES';
    id: string;
    payload?: TPayload;
    error?: TError;
};

/**
 * Heartbeat ping frame.
 */
export type RemotePingFrame = {
    t: 'PING';
};

/**
 * Heartbeat pong frame.
 */
export type RemotePongFrame = {
    t: 'PONG';
};

/**
 * In-band authentication or token refresh request frame.
 */
export type RemoteAuthFrame = {
    t: 'AUTH';
    token: string;
    metadata?: Record<string, unknown>;
};

/**
 * Successful authentication response frame.
 */
export type RemoteAuthOkFrame = {
    t: 'AUTH_OK';
    userId?: string;
};

/**
 * Failed authentication response frame.
 */
export type RemoteAuthFailFrame = {
    t: 'AUTH_FAIL';
    error: string;
    code?: number;
};

/**
 * Union of all valid remote wire frames.
 */
export type RemoteFrame<TChannel extends string = string, TPayload = unknown, TError = unknown> =
    | RemoteSubFrame<TChannel>
    | RemoteUnsubFrame<TChannel>
    | RemoteMsgFrame<TChannel, TPayload>
    | RemoteReqFrame<TChannel, TPayload>
    | RemoteResFrame<TPayload, TError>
    | RemotePingFrame
    | RemotePongFrame
    | RemoteAuthFrame
    | RemoteAuthOkFrame
    | RemoteAuthFailFrame;

/**
 * Pluggable serialization codec for encoding and decoding frames.
 */
export interface FrameCodec {
    encode(frame: RemoteFrame): string | Uint8Array;
    decode(raw: string | Uint8Array): RemoteFrame;
}

/**
 * Duck-typed duplex socket contract to decouple from specific WebSocket libraries.
 */
export interface RemoteSocket {
    send(data: string | Uint8Array): void;
    on(event: 'message', listener: (data: unknown) => void): void;
    on(event: 'close', listener: (code?: number, reason?: string) => void): void;
    on(event: 'error', listener: (err: unknown) => void): void;
    close(code?: number, reason?: string): void;
}

/**
 * Minimal contract for an in-process message bus compatible with @actdim/msgmesh.
 */
export interface RemoteBusLike<TChannel extends string = string> {
    send?(msg: {
        channel: TChannel;
        group?: string;
        topic?: string;
        payload?: unknown;
    }): Promise<unknown> | void;
    request?(msg: {
        channel: TChannel;
        group?: string;
        topic?: string;
        payload?: unknown;
    }): Promise<unknown>;
    provide?(params: {
        channel: TChannel;
        group?: string;
        callback: (inMsg: {
            address?: { channel: string; group?: string; topic?: string };
            channel?: string;
            topic?: string;
            group?: string;
            payload?: unknown;
        }) => Promise<unknown> | unknown;
    }): (() => void) | void;
    on?(params: {
        channel: string;
        group?: string;
        options?: { abortSignal?: AbortSignal };
        callback: (msg: {
            address?: { channel: string; group?: string; topic?: string };
            channel?: string;
            group?: string;
            topic?: string;
            payload?: unknown;
        }) => void;
    }): (() => void) | void;
}

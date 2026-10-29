/**
 * Frame types supported by the @actdim/msgmesh-remote wire protocol.
 */
export type RemoteFrameType = 'SUB' | 'UNSUB' | 'MSG' | 'REQ' | 'RES' | 'PING' | 'PONG';

/**
 * Client-to-server subscription request for a channel or topic.
 */
export type RemoteSubFrame = {
    t: 'SUB';
    channel: string;
    topic?: string;
};

/**
 * Client-to-server unsubscription request.
 */
export type RemoteUnsubFrame = {
    t: 'UNSUB';
    channel: string;
    topic?: string;
};

/**
 * One-way fire-and-forget message (both directions).
 */
export type RemoteMsgFrame = {
    t: 'MSG';
    channel: string;
    topic?: string;
    payload?: unknown;
};

/**
 * Correlated RPC request frame.
 */
export type RemoteReqFrame = {
    t: 'REQ';
    id: string;
    channel: string;
    topic?: string;
    payload?: unknown;
};

/**
 * Correlated RPC response frame.
 */
export type RemoteResFrame = {
    t: 'RES';
    id: string;
    payload?: unknown;
    error?: unknown;
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
 * Union of all valid remote wire frames.
 */
export type RemoteFrame =
    | RemoteSubFrame
    | RemoteUnsubFrame
    | RemoteMsgFrame
    | RemoteReqFrame
    | RemoteResFrame
    | RemotePingFrame
    | RemotePongFrame;

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

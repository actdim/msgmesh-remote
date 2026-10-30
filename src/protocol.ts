import {
    type RemoteFrame,
    type FrameCodec,
    type RemoteSubFrame,
    type RemoteUnsubFrame,
    type RemoteMsgFrame,
    type RemoteReqFrame,
    type RemoteResFrame,
    type RemotePingFrame,
    type RemotePongFrame,
    type RemoteAuthFrame,
    type RemoteAuthOkFrame,
    type RemoteAuthFailFrame,
} from './types';

export class FrameDecodeError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(`[msgmesh-remote] Frame decode error: ${message}`);
        this.name = 'FrameDecodeError';
    }
}

export class InvalidFrameError extends Error {
    constructor(message: string) {
        super(`[msgmesh-remote] Invalid frame: ${message}`);
        this.name = 'InvalidFrameError';
    }
}

/**
 * Validates that an arbitrary parsed object satisfies the RemoteFrame schema.
 */
export function validateFrame(data: unknown): RemoteFrame {
    if (!data || typeof data !== 'object') {
        throw new InvalidFrameError('Frame must be a non-null object');
    }

    const frame = data as Record<string, unknown>;
    const t = frame.t;

    if (typeof t !== 'string') {
        throw new InvalidFrameError('Missing or non-string frame type "t"');
    }

    switch (t) {
        case 'SUB':
            if (typeof frame.channel !== 'string' || !frame.channel) {
                throw new InvalidFrameError('SUB frame requires a non-empty string channel');
            }
            if (frame.group !== undefined && typeof frame.group !== 'string') {
                throw new InvalidFrameError('SUB group must be a string if provided');
            }
            if (frame.topic !== undefined && typeof frame.topic !== 'string') {
                throw new InvalidFrameError('SUB topic must be a string if provided');
            }
            return frame as RemoteSubFrame;

        case 'UNSUB':
            if (typeof frame.channel !== 'string' || !frame.channel) {
                throw new InvalidFrameError('UNSUB frame requires a non-empty string channel');
            }
            if (frame.group !== undefined && typeof frame.group !== 'string') {
                throw new InvalidFrameError('UNSUB group must be a string if provided');
            }
            if (frame.topic !== undefined && typeof frame.topic !== 'string') {
                throw new InvalidFrameError('UNSUB topic must be a string if provided');
            }
            return frame as RemoteUnsubFrame;

        case 'MSG':
            if (typeof frame.channel !== 'string' || !frame.channel) {
                throw new InvalidFrameError('MSG frame requires a non-empty string channel');
            }
            if (frame.group !== undefined && typeof frame.group !== 'string') {
                throw new InvalidFrameError('MSG group must be a string if provided');
            }
            if (frame.topic !== undefined && typeof frame.topic !== 'string') {
                throw new InvalidFrameError('MSG topic must be a string if provided');
            }
            return frame as RemoteMsgFrame;

        case 'REQ':
            if (typeof frame.id !== 'string' || !frame.id) {
                throw new InvalidFrameError('REQ frame requires a non-empty string id');
            }
            if (typeof frame.channel !== 'string' || !frame.channel) {
                throw new InvalidFrameError('REQ frame requires a non-empty string channel');
            }
            if (frame.group !== undefined && typeof frame.group !== 'string') {
                throw new InvalidFrameError('REQ group must be a string if provided');
            }
            if (frame.topic !== undefined && typeof frame.topic !== 'string') {
                throw new InvalidFrameError('REQ topic must be a string if provided');
            }
            return frame as RemoteReqFrame;

        case 'RES':
            if (typeof frame.id !== 'string' || !frame.id) {
                throw new InvalidFrameError('RES frame requires a non-empty string id');
            }
            return frame as RemoteResFrame;

        case 'PING':
            return { t: 'PING' };

        case 'PONG':
            return { t: 'PONG' };

        case 'AUTH':
            if (typeof frame.token !== 'string' || !frame.token) {
                throw new InvalidFrameError('AUTH frame requires a non-empty string token');
            }
            return frame as RemoteAuthFrame;

        case 'AUTH_OK':
            return frame as RemoteAuthOkFrame;

        case 'AUTH_FAIL':
            if (typeof frame.error !== 'string' || !frame.error) {
                throw new InvalidFrameError('AUTH_FAIL frame requires a non-empty string error');
            }
            return frame as RemoteAuthFailFrame;

        default:
            throw new InvalidFrameError(`Unknown frame type: "${t}"`);
    }
}

/**
 * Standard JSON-based frame codec.
 */
export class JsonFrameCodec implements FrameCodec {
    encode(frame: RemoteFrame): string {
        return JSON.stringify(frame);
    }

    decode(raw: string | Uint8Array): RemoteFrame {
        let text: string;
        if (typeof raw === 'string') {
            text = raw;
        } else if (raw instanceof Uint8Array) {
            text = new TextDecoder().decode(raw);
        } else {
            throw new FrameDecodeError('Unsupported raw payload type; expected string or Uint8Array');
        }

        try {
            const parsed = JSON.parse(text);
            return validateFrame(parsed);
        } catch (err) {
            if (err instanceof InvalidFrameError) {
                throw err;
            }
            throw new FrameDecodeError('Failed to parse JSON string', err);
        }
    }
}

export const defaultCodec = new JsonFrameCodec();

export function createSubFrame(channel: string, topic?: string, group?: string): RemoteSubFrame {
    const f: RemoteSubFrame = { t: 'SUB', channel };
    if (topic !== undefined) f.topic = topic;
    if (group !== undefined) f.group = group;
    return f;
}

export function createUnsubFrame(channel: string, topic?: string, group?: string): RemoteUnsubFrame {
    const f: RemoteUnsubFrame = { t: 'UNSUB', channel };
    if (topic !== undefined) f.topic = topic;
    if (group !== undefined) f.group = group;
    return f;
}

export function createMsgFrame(channel: string, payload?: unknown, topic?: string, group?: string): RemoteMsgFrame {
    const f: RemoteMsgFrame = { t: 'MSG', channel };
    if (payload !== undefined) f.payload = payload;
    if (topic !== undefined) f.topic = topic;
    if (group !== undefined) f.group = group;
    return f;
}

export function createReqFrame(id: string, channel: string, payload?: unknown, topic?: string, group?: string): RemoteReqFrame {
    const f: RemoteReqFrame = { t: 'REQ', id, channel };
    if (payload !== undefined) f.payload = payload;
    if (topic !== undefined) f.topic = topic;
    if (group !== undefined) f.group = group;
    return f;
}

export function createResFrame(id: string, payload?: unknown, error?: unknown): RemoteResFrame {
    if (error !== undefined) {
        return { t: 'RES', id, error };
    }
    return { t: 'RES', id, payload };
}

export function createPingFrame(): RemotePingFrame {
    return { t: 'PING' };
}

export function createPongFrame(): RemotePongFrame {
    return { t: 'PONG' };
}

export function createAuthFrame(token: string, metadata?: Record<string, unknown>): RemoteAuthFrame {
    const f: RemoteAuthFrame = { t: 'AUTH', token };
    if (metadata) f.metadata = metadata;
    return f;
}

export function createAuthOkFrame(userId?: string): RemoteAuthOkFrame {
    const f: RemoteAuthOkFrame = { t: 'AUTH_OK' };
    if (userId) f.userId = userId;
    return f;
}

export function createAuthFailFrame(error: string, code?: number): RemoteAuthFailFrame {
    const f: RemoteAuthFailFrame = { t: 'AUTH_FAIL', error };
    if (code !== undefined) f.code = code;
    return f;
}

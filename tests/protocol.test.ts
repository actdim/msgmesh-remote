import { describe, it, expect } from 'vitest';
import {
    JsonFrameCodec,
    validateFrame,
    InvalidFrameError,
    FrameDecodeError,
    createSubFrame,
    createUnsubFrame,
    createMsgFrame,
    createReqFrame,
    createResFrame,
    createPingFrame,
    createPongFrame,
} from '../src/protocol';
import { type RemoteFrame } from '../src/types';

describe('Remote Protocol & Codec', () => {
    const codec = new JsonFrameCodec();

    it('encodes and decodes SUB frame', () => {
        const frame = createSubFrame('APP.EVENTS', 'topic-1');
        const encoded = codec.encode(frame);
        const decoded = codec.decode(encoded);

        expect(decoded).toEqual({
            t: 'SUB',
            channel: 'APP.EVENTS',
            topic: 'topic-1',
        });
    });

    it('encodes and decodes UNSUB frame without topic', () => {
        const frame = createUnsubFrame('APP.EVENTS');
        const encoded = codec.encode(frame);
        const decoded = codec.decode(encoded);

        expect(decoded).toEqual({
            t: 'UNSUB',
            channel: 'APP.EVENTS',
        });
    });

    it('encodes and decodes MSG frame with payload', () => {
        const payload = { counter: 42, text: 'hello' };
        const frame = createMsgFrame('CAD.TRANSFORM', payload, 'node-7');
        const encoded = codec.encode(frame);
        const decoded = codec.decode(encoded);

        expect(decoded).toEqual({
            t: 'MSG',
            channel: 'CAD.TRANSFORM',
            topic: 'node-7',
            payload,
        });
    });

    it('encodes and decodes REQ frame', () => {
        const frame = createReqFrame('req-123', 'API.USER.GET', { userId: 'u1' });
        const encoded = codec.encode(frame);
        const decoded = codec.decode(encoded);

        expect(decoded).toEqual({
            t: 'REQ',
            id: 'req-123',
            channel: 'API.USER.GET',
            payload: { userId: 'u1' },
        });
    });

    it('encodes and decodes RES frame with success', () => {
        const frame = createResFrame('req-123', { name: 'Alice' });
        const encoded = codec.encode(frame);
        const decoded = codec.decode(encoded);

        expect(decoded).toEqual({
            t: 'RES',
            id: 'req-123',
            payload: { name: 'Alice' },
        });
    });

    it('encodes and decodes RES frame with error', () => {
        const frame = createResFrame('req-123', undefined, { message: 'Not found', code: 404 });
        const encoded = codec.encode(frame);
        const decoded = codec.decode(encoded);

        expect(decoded).toEqual({
            t: 'RES',
            id: 'req-123',
            error: { message: 'Not found', code: 404 },
        });
    });

    it('encodes and decodes PING and PONG frames', () => {
        const ping = createPingFrame();
        const pong = createPongFrame();

        expect(codec.decode(codec.encode(ping))).toEqual({ t: 'PING' });
        expect(codec.decode(codec.encode(pong))).toEqual({ t: 'PONG' });
    });

    it('supports Uint8Array decoding', () => {
        const frame = createPingFrame();
        const str = codec.encode(frame);
        const bytes = new TextEncoder().encode(str);
        const decoded = codec.decode(bytes);

        expect(decoded).toEqual({ t: 'PING' });
    });

    it('rejects invalid JSON syntax', () => {
        expect(() => codec.decode('not a json')).toThrow(FrameDecodeError);
    });

    it('rejects unknown frame type', () => {
        expect(() => validateFrame({ t: 'UNKNOWN_TYPE' })).toThrow(InvalidFrameError);
    });

    it('rejects missing or empty required fields', () => {
        expect(() => validateFrame({ t: 'SUB' })).toThrow(InvalidFrameError);
        expect(() => validateFrame({ t: 'SUB', channel: '' })).toThrow(InvalidFrameError);
        expect(() => validateFrame({ t: 'REQ', channel: 'C1' })).toThrow(InvalidFrameError);
        expect(() => validateFrame({ t: 'RES' })).toThrow(InvalidFrameError);
    });
});

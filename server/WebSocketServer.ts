import uws, {
  App,
  TemplatedApp,
  WebSocket,
  us_listen_socket,
} from 'uWebSockets.js';
import { TextDecoder } from 'util';
import Session from './Session';
import { Db } from 'mongodb';
import {
  decodeClientMessageTrait,
  encodeServerMessageTrait,
  messageProtocolError,
  protocolErrorDecodeMessageError,
  protocolErrorExpectingBinaryMessage,
} from '@jslogger/schema/src/protocol';
import { ILogger } from '@victorqueiroz/logger';
import { Codec } from 'jsbuffer/codec';

export interface IWebSocketServerOptions {
  db: Db;
  logger: ILogger;
}

export default class WebSocketServer {
  readonly #app: TemplatedApp;
  readonly #sessions = new Map<bigint, Session>();
  readonly #socketBySession = new Map<Session, WebSocket<unknown>>();
  readonly #sessionBySocket = new Map<WebSocket<unknown>, Session>();
  readonly #db;
  readonly #logger;
  readonly #codec = new Codec({
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
  });
  #listening: Promise<us_listen_socket> | null;
  public constructor({ logger, db }: IWebSocketServerOptions) {
    this.#db = db;
    this.#logger = logger.at('WebSocketServer');
    this.#listening = null;
    this.#app = App({}).ws('/ws', {
      compression: uws.DISABLED,
      drain: (ws) => {
        const session = this.#sessionBySocket.get(ws);
        if (session) {
          this.#logger.error(
            [
              'received "%s" event for socket with no session attached to it.',
              'what has been going on in this socket?',
            ].join(' '),
            'drain'
          );
          session.onDrain();
        }
      },
      message: (ws, arrayBuffer, isBinary) => {
        if (!isBinary) {
          this.#logger.error(
            'received non-binary message: %o',
            new TextDecoder().decode(new Uint8Array(arrayBuffer))
          );
          ws.send(
            this.#codec.encode(
              encodeServerMessageTrait,
              messageProtocolError({
                error: protocolErrorExpectingBinaryMessage(),
              })
            ),
            true,
            false
          );
          return;
        }
        const clientMessage = this.#codec.decode(
          decodeClientMessageTrait,
          new Uint8Array(arrayBuffer)
        );
        if (clientMessage === null) {
          this.#logger.error(
            'failed to decode message: %d bytes',
            arrayBuffer.byteLength
          );
          ws.send(
            this.#codec.encode(
              encodeServerMessageTrait,
              messageProtocolError({
                error: protocolErrorDecodeMessageError(),
              })
            ),
            true,
            false
          );
          return;
        }
        let session = this.#sessions.get(BigInt(clientMessage.sessionId));
        if (!session) {
          session = new Session({
            logger: this.#logger,
            db: this.#db,
            id: BigInt(clientMessage.sessionId),
          });
          this.#sessions.set(BigInt(clientMessage.sessionId), session);
        }
        const socket = this.#socketBySession.get(session);
        if (socket !== ws) {
          session.onSocket(ws);
          this.#socketBySession.set(session, ws);
          this.#sessionBySocket.set(ws, session);
        }
        /**
         * process message request
         */
        session.onClientMessage(clientMessage);
      },
      close: (ws, code, message) => {
        const session = this.#sessionBySocket.get(ws);
        if (session) {
          session.onSocketClose();
        }
        this.#logger.log('socket closed with code %d: %o', code, message);
      },
    });
  }
  public async close() {
    if (!this.#listening) {
      return;
    }
    const socket = await this.#listening;
    uws.us_listen_socket_close(socket);
  }
  public listen(port: number) {
    if (this.#listening !== null) {
      return;
    }
    this.#listening = new Promise<us_listen_socket>((resolve) => {
      this.#app.listen(port, (socket) => {
        this.#logger.log('listening on port: %d', port);
        resolve(socket);
      });
    });
  }
}

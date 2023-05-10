import { WebSocket } from 'uWebSockets.js';
import { Db, ObjectId } from 'mongodb';
import {
  Error,
  errorCallNotImplemented,
  errorDatabaseFailure,
  errorUnknownFailure,
} from '@jscriptlogger/schema/src/protocol/Error';
import {
  ClientMessage,
  ServerMessage,
  acknowledgeMessage,
  encodeMessageResultError,
  encodeMessageResultSuccess,
  encodeServerMessageTrait,
  messageRequest,
  messageResultError,
  messageResultSuccess,
} from '@jscriptlogger/schema/src/protocol';
import { Request } from '@jscriptlogger/schema/src/protocol/Request';
import { Result } from '@jscriptlogger/schema/src/protocol/Result';
import { void_t } from '@jscriptlogger/schema/src/protocol/void';
import { Exception, DatabaseFailure } from '../exception';
import { ILogger } from '@victorqueiroz/logger';
import { Codec } from 'jsbuffer/codec';

// app
import { objectId } from '@jscriptlogger/schema/src/app/objectId';
import { saveValueResult } from '@jscriptlogger/schema/src/app/value';
import ValueCommands from '../app/value/ValueCommands';
import {
  databaseValueToSchemaValue,
  schemaValueToDatabaseValue,
} from '../app/value/converter';
import PageCommands from '../app/page/PageCommands';
import {
  addPageLineResult,
  createPageResult,
  getPageLinesResult,
  getPagesResult,
  page,
  pageLine,
} from '@jscriptlogger/schema/src/app/page';
import { PageLineType } from '../app/page/model';

class CallNotImplementedException extends Exception {}

interface IOutgoingMessage {
  acknowledged: boolean;
  result: messageResultError | messageResultSuccess;
}

interface IIncomingMessages {
  request: messageRequest;
}

export interface ISessionOptions {
  logger: ILogger;
  db: Db;
  id: bigint;
}

export default class Session {
  readonly #id;
  readonly #commandMap;
  readonly #logger;
  readonly #queue = new Array<Uint8Array>();
  readonly #outgoingMessages = new Array<IOutgoingMessage>();
  readonly #incomingMessages = new Map<bigint, IIncomingMessages>();
  readonly #encoder = new Codec({
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
  });
  #socket: WebSocket<unknown> | null;
  public constructor({ id, logger, db }: ISessionOptions) {
    this.#id = id;
    this.#socket = null;
    this.#logger = logger.at('Session');
    this.#commandMap = {
      page: new PageCommands({
        db,
      }),
      value: new ValueCommands({
        db,
      }),
    };
  }
  public onDrain() {}
  public onClientMessage(clientMessage: ClientMessage) {
    this.#logger.log('received client message: %o', clientMessage);
    switch (clientMessage._name) {
      case 'protocol.index.messageRequest':
        this.#onMessageRequest(clientMessage);
        break;
      case 'protocol.index.acknowledgeMessage':
        this.#logger.log('receive acknowledgement: %o', clientMessage);
    }
  }
  #onMessageRequest(message: messageRequest) {
    const existingMessage = this.#incomingMessages.get(
      BigInt(message.requestId)
    );
    if (existingMessage) {
      this.#logger.log('received existing message: %o', existingMessage);
      return;
    }
    this.#sendAck(message.requestId);
    this.#onRequest(message.request)
      .then((result) => {
        this.#sendResult(
          messageResultSuccess({
            requestId: message.requestId,
            result,
          })
        );
      })
      .catch((reason) => {
        this.#logger.error(
          'failure while processing request (%s): %o',
          message.request._name,
          reason
        );
        let error: Error;
        if (reason instanceof DatabaseFailure) {
          error = errorDatabaseFailure();
        } else if (reason instanceof CallNotImplementedException) {
          error = errorCallNotImplemented();
        } else {
          error = errorUnknownFailure();
        }
        this.#sendResult(
          messageResultError({
            requestId: message.requestId,
            error,
          })
        );
      });
  }
  public onCreated() {}
  public onSocket(ws: WebSocket<unknown> | null) {
    if (ws === this.#socket) {
      return;
    }
    this.#socket = ws;
  }
  public onSocketClose() {
    this.#socket = null;
    this.#logger.error('session closed');
  }
  #sendResult(result: messageResultSuccess | messageResultError) {
    this.#outgoingMessages.push({
      result,
      acknowledged: false,
    });
    this.#sendServerMessage(result);
  }
  #sendServerMessage(result: ServerMessage) {
    this.#send(this.#encoder.encode(encodeServerMessageTrait, result));
  }
  #sendAck(messageId: string) {
    this.#send(
      this.#encoder.encode(
        encodeServerMessageTrait,
        acknowledgeMessage({
          messageId,
          sessionId: this.#id.toString(),
        })
      )
    );
  }
  #send(value: Uint8Array) {
    if (!this.#socket) {
      const copy = new Uint8Array(value.byteLength);
      copy.set(value);
      this.#queue.push(copy);
      return;
    }
    // FIXME: process result of socket.send call
    const sendResult = this.#socket.send(value, true, false);
    if (sendResult !== 1) {
      this.#logger.error('socket.send call returned: %d', sendResult);
    } else {
      this.#logger.debug('successfully sent %d bytes', value.byteLength);
    }
  }
  async #onRequest(request: Request): Promise<Result> {
    let result: Result = void_t();
    switch (request._name) {
      case 'app.page.CreatePage': {
        const pageId = await this.#commandMap.page.createPage({
          title: request.title,
        });
        result = createPageResult({
          id: objectId({
            value: pageId.toHexString(),
          }),
        });
        break;
      }
      case 'app.value.SaveValue': {
        const resultId = await this.#commandMap.value.saveValue(
          schemaValueToDatabaseValue(request.value)
        );
        result = saveValueResult({
          id: objectId({
            value: resultId.toHexString(),
          }),
        });
        break;
      }
      case 'app.page.GetPages': {
        const pages = await this.#commandMap.page.getPages({
          offset: request.offset,
          limit: request.limit,
        });
        result = getPagesResult({
          count: pages.count.toString(),
          list: pages.list.map((p) =>
            page({
              id: objectId({
                value: p._id.toHexString(),
              }),
              title: p.title,
            })
          ),
        });
        break;
      }
      case 'app.page.GetPageLines': {
        const lines = await this.#commandMap.page.getPageLines({
          pageId: new ObjectId(request.pageId.value),
          offset: request.offset,
          limit: request.limit,
        });
        result = getPageLinesResult({
          count: lines.count.toString(),
          list: lines.list.map((l) =>
            pageLine({
              id: objectId({
                value: l._id.toHexString(),
              }),
              values: l.line.map((l) => databaseValueToSchemaValue(l)),
            })
          ),
        });
        break;
      }
      case 'app.page.AddPageLine': {
        let lineType: PageLineType;
        switch (request.lineType._name) {
          case 'app.page.lineTypeError':
            lineType = PageLineType.Error;
            break;
          case 'app.page.lineTypeLog':
            lineType = PageLineType.Log;
            break;
        }
        const lineId = await this.#commandMap.page.addPageLine({
          type: lineType,
          pageId: new ObjectId(request.pageId.value),
          line: request.line.map((v) => schemaValueToDatabaseValue(v)),
        });
        result = addPageLineResult({
          id: objectId({
            value: lineId.toString(),
          }),
        });
        break;
      }
      default:
        throw new CallNotImplementedException();
    }
    return result;
  }
}

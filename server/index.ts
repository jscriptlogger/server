import { MongoClient } from 'mongodb';
import WebSocketServer from './WebSocketServer';
import LoggerNode from '@victorqueiroz/logger/node';
import { LogLevel } from '@victorqueiroz/logger';

(async () => {
  let port =
    typeof process.env['PORT'] === 'string'
      ? parseInt(process.env['PORT'], 10)
      : null;

  if (
    port === null ||
    !Number.isInteger(port) ||
    Number.isNaN(port) ||
    !Number.isFinite(port)
  ) {
    port = 3333;
  }
  const mongoClient = await MongoClient.connect('mongodb://database:27017');
  const logger = new LoggerNode(['Server'], {
    logLevel: LogLevel.Debug,
  });
  const app = new WebSocketServer({
    logger,
    db: mongoClient.db('logger'),
  });
  app.listen(port);
})().catch((reason) => {
  process.exitCode = 1;
  console.error(reason);
});

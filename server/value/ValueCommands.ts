import { Collection, Db, ObjectId } from 'mongodb';
import { IModelValue, Value } from './model';
import { DatabaseFailure } from '../exceptions';

export default class ValueCommands {
  readonly #collection: Collection<IModelValue>;
  public constructor({ db }: { db: Db }) {
    this.#collection = db.collection<IModelValue>('values');
  }
  public async saveValue(value: Value) {
    const result = await this.#collection.insertOne({
      _id: new ObjectId(),
      value,
      createdAt: new Date(),
    });
    if (!result.acknowledged) {
      throw new DatabaseFailure();
    }
    return result.insertedId;
  }
  public async addPageItem(value: Value) {
    const result = await this.#collection.insertOne({
      _id: new ObjectId(),
      value,
      createdAt: new Date(),
    });
    if (!result.acknowledged) {
      throw new DatabaseFailure();
    }
    return result.insertedId;
  }
}

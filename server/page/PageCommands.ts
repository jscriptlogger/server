import { Db, ObjectId } from 'mongodb';
import { IModelPage, IModelPageLine, PageLineType } from './model';
import { DatabaseFailure, ResourceNotFoundError } from '../exceptions';
import { IModelValue, Value, ValueType } from '../value/model';

export default class PageCommands {
  readonly #pages;
  readonly #values;
  readonly #pageLines;
  public constructor({ db }: { db: Db }) {
    this.#pages = db.collection<IModelPage>('pages');
    this.#values = db.collection<IModelValue>('values');
    this.#pageLines = db.collection<IModelPageLine>('pageLines');
  }
  public getPages({ offset, limit }: { offset: number; limit: number }) {
    return this.#pages.find().skip(offset).limit(limit).toArray();
  }
  public getPageLines({
    pageId,
    offset,
    limit,
  }: {
    pageId: ObjectId;
    offset: number;
    limit: number;
  }) {
    return this.#pageLines
      .find({
        pageId,
      })
      .skip(offset)
      .limit(limit)
      .toArray();
  }
  public async addPageLine({
    line,
    type,
    pageId,
  }: {
    pageId: ObjectId;
    type: PageLineType;
    line: Value[];
  }) {
    const valueIds = new Array<ObjectId>();
    for (const v of line) {
      this.#getObjectIdsFromValue(v, valueIds);
    }
    const [page, values] = await Promise.all([
      this.#pages.findOne({ _id: pageId }),
      this.#values
        .find({
          _id: {
            $in: valueIds,
          },
        })
        .toArray(),
    ]);
    if (!page) {
      console.error('page was not found: %o', pageId);
      throw new ResourceNotFoundError();
    }
    if (valueIds.length !== values.length) {
      console.error(
        'expected %d values, but got only %d pages',
        valueIds.length,
        values.length
      );
      throw new ResourceNotFoundError();
    }
    const result = await this.#pageLines.insertOne({
      type,
      pageId,
      line,
      _id: new ObjectId(),
      createdAt: new Date(),
    });
    if (!result.acknowledged) {
      throw new DatabaseFailure();
    }
    return result.insertedId;
  }
  public async createPage({ title }: { title: string }) {
    const result = await this.#pages.insertOne({
      _id: new ObjectId(),
      createdAt: new Date(),
      title,
    });
    if (!result.acknowledged) {
      throw new DatabaseFailure();
    }
    return result.insertedId;
  }
  #getObjectIdsFromValue(value: Value, list: ObjectId[]) {
    switch (value.type) {
      case ValueType.Array:
        for (const item of value.value) {
          this.#getObjectIdsFromValue(item, list);
        }
        break;
      case ValueType.Object:
        for (const [k, v] of value.value) {
          this.#getObjectIdsFromValue(k, list);
          this.#getObjectIdsFromValue(v, list);
        }
        break;
      case ValueType.Reference:
        list.push(value.valueId);
        break;
    }
  }
}

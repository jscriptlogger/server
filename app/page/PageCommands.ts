import { Db, ObjectId } from 'mongodb';
import { IModelPage, IModelPageLine, PageLineType } from './model';
import { DatabaseFailure, ResourceNotFoundError } from '../../exception';
import { IModelValue, Value, ValueType } from '../value/model';
import { Filter } from 'mongodb';

export default class PageCommands {
  readonly #pages;
  readonly #values;
  readonly #pageLines;
  public constructor({ db }: { db: Db }) {
    this.#pages = db.collection<IModelPage>('pages');
    this.#values = db.collection<IModelValue>('values');
    this.#pageLines = db.collection<IModelPageLine>('pageLines');
  }
  public async getPages({ offset, limit }: { offset: number; limit: number }) {
    const query: Filter<IModelPage> = {};
    const cursor = this.#pages.find(query).sort('createdAt', 'descending');
    const [count, list] = await Promise.all([
      this.#pages.countDocuments(query),
      cursor.skip(offset).limit(limit).toArray(),
    ]);
    return {
      list,
      count,
    };
  }
  public async getPageLines({
    pageId,
    offset,
    limit,
  }: {
    pageId: ObjectId;
    offset: number;
    limit: number;
  }) {
    const query = {
      pageId,
    };
    const cursor = this.#pageLines.find(query);
    const [list, count] = await Promise.all([
      cursor.skip(offset).limit(limit).toArray(),
      this.#pageLines.countDocuments(query),
    ]);
    return {
      list,
      count,
    };
  }
  public async getFirstPageFromTitle(title: string){

    return await this.#pages.findOne({ title });
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

import { ObjectId } from "mongodb";
import { Value } from "../value/model";

export interface IModelPage {
  _id: ObjectId;
  title: string;
  createdAt: Date;
}

export enum PageLineType {
  Log,
  Error,
}

export interface IModelPageLine {
  _id: ObjectId;
  pageId: ObjectId;
  type: PageLineType;
  line: Value[];
  createdAt: Date;
}

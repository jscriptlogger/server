import { ObjectId } from 'mongodb';

export enum ValueType {
  Null,
  Undefined,
  Reference,
  String,
  Array,
  NaN,
  Object,
  Number,
  Boolean,
}

export interface IValueNull {
  type: ValueType.Null;
}

export interface IValueNaN {
  type: ValueType.NaN;
}

export interface IValueUndefined {
  type: ValueType.Undefined;
}

export interface IValueString {
  type: ValueType.String;
  value: string;
}

export interface IValueBoolean {
  type: ValueType.Boolean;
  value: boolean;
}

export interface IValueNumber {
  type: ValueType.Number;
  value: number;
}

export interface IValueArray {
  type: ValueType.Array;
  value: Value[];
}

export interface IValueObject {
  type: ValueType.Object;
  value: [Value, Value][];
}

export interface IValueReference {
  type: ValueType.Reference;
  valueId: ObjectId;
}

export type Value =
  | IValueNull
  | IValueUndefined
  | IValueObject
  | IValueString
  | IValueArray
  | IValueNumber
  | IValueNaN
  | IValueBoolean
  | IValueReference;

export interface IModelValue {
  _id: ObjectId;
  value: Value;
  createdAt: Date;
}

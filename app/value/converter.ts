import { Value as ModelValue, ValueType } from './model';
import { ObjectId } from 'mongodb';
import { objectId } from '@jscriptlogger/schema/src/app/objectId';
import {
  Value as SchemaValue,
  valueNaN,
  valueNull,
  valueNumber,
  valueObject,
  valueString,
  valueUndefined,
  valueValueRef,
  valueVector,
  valueBoolean,
  boolTrue,
  boolFalse,
} from '@jscriptlogger/schema/src/app/value';

export function databaseValueToSchemaValue(value: ModelValue): SchemaValue {
  switch (value.type) {
    case ValueType.Array:
      return valueVector({
        value: value.value.map((v) => databaseValueToSchemaValue(v)),
      });
    case ValueType.Null:
      return valueNull();
    case ValueType.Undefined:
      return valueUndefined();
    case ValueType.Reference:
      return valueValueRef({
        id: objectId({
          value: value.valueId.toHexString(),
        }),
      });
    case ValueType.String:
      return valueString({
        value: value.value,
      });
    case ValueType.NaN:
      return valueNaN();
    case ValueType.Object:
      return valueObject({
        value: value.value.map(([a, b]) => [
          databaseValueToSchemaValue(a),
          databaseValueToSchemaValue(b),
        ]),
      });
    case ValueType.Number:
      return valueNumber({
        value: value.value,
      });
    case ValueType.Boolean:
      return valueBoolean({
        value: value.value ? boolTrue() : boolFalse(),
      });
  }
}

export function schemaValueToDatabaseValue(value: SchemaValue): ModelValue {
  switch (value._name) {
    case 'app.value.valueValueRef':
      return {
        type: ValueType.Reference,
        valueId: new ObjectId(value.id.value),
      };
    case 'app.value.valueNumber':
      return {
        type: ValueType.Number,
        value: value.value,
      };
    case 'app.value.valueString':
      return {
        type: ValueType.String,
        value: value.value,
      };
    case 'app.value.valueBoolean':
      return {
        type: ValueType.Boolean,
        value: value.value._name === 'app.value.boolTrue',
      };
    case 'app.value.valueVector':
      return {
        type: ValueType.Array,
        value: value.value.map((item) => schemaValueToDatabaseValue(item)),
      };
    case 'app.value.valueObject':
      return {
        type: ValueType.Object,
        value: value.value.map(
          (item) =>
            [
              schemaValueToDatabaseValue(item[0]),
              schemaValueToDatabaseValue(item[1]),
            ] as [ModelValue, ModelValue]
        ),
      };
    case 'app.value.valueNaN':
      return {
        type: ValueType.NaN,
      };
    case 'app.value.valueNull':
      return {
        type: ValueType.Null,
      };
    case 'app.value.valueUndefined':
      return {
        type: ValueType.Undefined,
      };
  }
}

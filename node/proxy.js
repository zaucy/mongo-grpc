const bson = require("bson");
const mongodb = require("mongodb");
const mongo_pb = require("../dist/node/mongo_pb");
const bson_pb = require('../dist/node/bson_pb');

function protoObjectIdToBson(protoObjectId) {
  let objectId = new bson.ObjectID(protoObjectId.getId());
  return objectId;
}

function bsonObjectIdToProto(bsonObjectId) {
  let protoObjectId = new bson_pb.ObjectID();
  protoObjectId.setId(bsonObjectId.toString());
  return protoObjectId;
}

function protoJsPrimitiveToBson(value) {
  return value;
}

function protoObjectToBson(object) {
  let props = object.getKeyValueMap();
  let bsonObj = {};

  for(let [key, value] of props.entries()) {
    bsonObj[key] = protoValueToBson(props.get(key));
  }

  return bsonObj;
}

function protoArrayToBson(array) {
  let elements = array.getElementList();
  let bsonArray = elements.map(element => {
    return protoValueToBson(element);
  });

  return bsonArray;
}

function protoBinDataToBson(binData) {
  return binData;
}

function bsonDateToProto(bsonDate) {
  let protoDate = new bson_pb.Date();

  protoDate.setMilliseconds(bsonDate.getTime());

  return protoDate;
}

function protoDateToBson(date) {
  let milliseconds = date.getMilliseconds();

  return new Date(milliseconds);
}

function protoRegexToBson(regex) {
  let pattern = regex.getPattern();
  let options = regex.getOptions();

  return new RegExp(pattern, options);
}

function protoTimestampToBson(timestamp) {
  let seconds = timestamp.getSeconds();
  let ordinal = timestamp.getOrdinal();
  
  return new bson.Timestamp(seconds, ordinal);
}

function protoValueToBson(value) {
  if(value.hasDouble()) {
    return protoJsPrimitiveToBson(value.getDouble());
  } else
  if(value.hasString()) {
    return protoJsPrimitiveToBson(value.getString());
  } else
  if(value.hasObject()) {
    return protoObjectToBson(value.getObject());
  } else
  if(value.hasArray()) {
    return protoArrayToBson(value.getArray());
  } else
  if(value.hasBinData()) {
    return protoBinDataToBson(value.getBinData());
  } else
  if(value.hasObjectId()) {
    return protoObjectIdToBson(value.getObjectId());
  } else
  if(value.hasBool()) {
    return protoJsPrimitiveToBson(value.getBool());
  } else
  if(value.hasDate()) {
    return protoDateToBson(value.getDate());
  } else
  if(value.hasRegex()) {
    return protoRegexToBson(value.getRegex());
  } else
  if(value.hasInt()) {
    return protoJsPrimitiveToBson(value.getInt());
  } else
  if(value.hasTimestamp()) {
    return protoTimestampToBson(value.getTimestamp());
  } else
  if(value.hasLong()) {
    return protoJsPrimitiveToBson(value.getLong());
  }
}

function bsonValueToProto(bsonValue) {
  let protoValue = new bson_pb.Value();

  if(typeof bsonValue === "string") {
    protoValue.setString(bsonValue);
  } else
  if(typeof bsonValue === "number") {
    protoValue.setDouble(bsonValue);
  } else
  if(typeof bsonValue === "boolean") {
    protoValue.setBool(bsonValue);
  } else
  if(!bsonValue) {
    protoValue.setNull(new bson_pb.Null());
  } else
  if(Buffer.isBuffer(bsonValue)) {
    protoValue.setBinData(bsonValue);
  } else
  if(Array.isArray(bsonValue)) {
    let protoArray = new bson_pb.Array();
    protoArray.setElementList(bsonValue.map(v => bsonValueToProto(v)));
    protoValue.setArray(protoArray);
  } else
  if(bsonValue instanceof Date) {
    protoValue.setDate(bsonDateToProto(bsonValue));
  } else
  if(bson.ObjectID.isValid(bsonValue)) {
    protoValue.setObjectId(bsonObjectIdToProto(bsonValue));
  } else {
    console.warn("UNHANDLED TYPE (bsonValueToProto)", bsoNValue);
  }

  return protoValue;
}

class MongoGrpcCollectionProxy {
  constructor(collection) {
    this._collection = collection;
  }

  insertOne(call, callback) {
    const {request} = call;

    if(!request.hasDocument()) {
      return callback(new Error("No document sent"));
    }

    let reqDoc = request.getDocument();
    let reqDocProps = reqDoc.getKeyValueMap();
    let doc = {};

    if(reqDoc.hasId()) {
      doc._id = protoObjectIdToBson(reqDoc.getObjectId());
    }

    for(let [key, value] of reqDocProps.entries()) {
      doc[key] = protoValueToBson(reqDocProps.get(key));
    }

    this._collection.insertOne(doc)
    .then(result => {

      let response = new mongo_pb.InsertOneResponse();
      response.setAcknowledged(true);
      response.setInsertedId(bsonObjectIdToProto(result.insertedId));
      callback(null, response);
    })
    .catch(err => {
      callback(err);
    });
  }

  insertMany(call, callback) {
    const {request} = call;

    let docs = [];
    let reqDocs = request.getDocumentList();

    for(let reqDoc of reqDocs) {
      let reqDocProps = reqDoc.getKeyValueMap();
      let doc = {};
  
      if(reqDoc.hasId()) {
        doc._id = protoObjectIdToBson(reqDoc.getObjectId());
      }
  
      for(let [key, value] of reqDocProps.entries()) {
        doc[key] = protoValueToBson(reqDocProps.get(key));
      }
      
      docs.push(doc);
    }
    
    this._collection.insertMany(docs, {
      ordered: request.getOrdered()
    })
    .then(result => {
      let response = new mongo_pb.InsertManyResponse();
      response.setAcknowledged(true);

      for(let key in result.insertedIds) {
        let insertedId = result.insertedIds[key];
        response.addInsertedId(bsonObjectIdToProto(insertedId));
      }

      callback(null, response);
    })
    .catch(err => {
      callback(err);
    });
  }

  findOne(call, callback) {
    const {request} = call;

    let filterQuery = {};

    if(request.hasQuery()) {
      let query = request.getQuery();
      let keyValues = query.getKeyValueMap();
      for(let [key, value] of keyValues.entries()) {
        filterQuery[key] = protoValueToBson(value);
      }
    }

    this._collection.findOne(filterQuery)
    .then(doc => {
      let resDoc = new bson_pb.Document();
      let resDocProps = resDoc.getKeyValueMap();

      resDoc.setId(bsonObjectIdToProto(doc._id));

      for(let key in doc) {
        resDocProps.set(key, bsonValueToProto(doc[key]));
      }

      callback(null, resDoc);
    })
    .catch(err => {
      callback(err);
    });
  }

  find(writeStream) {
    const {request} = writeStream;

    let filterQuery = {};

    if(request.hasQuery()) {
      let query = request.getQuery();
      let keyValues = query.getKeyValueMap();
      for(let [key, value] of keyValues.entries()) {
        filterQuery[key] = protoValueToBson(value);
      }
    }

    let cursor = this._collection.find(filterQuery);

    cursor.on("data", doc => {
      let resDoc = new bson_pb.Document();
      let resDocProps = resDoc.getKeyValueMap();

      resDoc.setId(bsonObjectIdToProto(doc._id));

      for(let key in doc) {
        resDocProps.set(key, bsonValueToProto(doc[key]));
      }

      writeStream.write(resDoc);
    });

    cursor.on("end", () => {
      writeStream.end();
    });

  }
}

exports.MongoGrpcCollectionProxy = MongoGrpcCollectionProxy;

const bson = require("bson");
const pify = require("pify");
const grpc = require("grpc");
const mongodb = require("mongodb");
const mongo_grpc_pb = require('./dist/node/proto/mongo_grpc_pb');
const mongo_pb = require('./dist/node/proto/mongo_pb');
const bson_pb = require('./dist/node/proto/bson_pb');
const test = require('ava');
const {MongoGrpcCollectionProxy} = require("./node/proxy");

function createTestClient(port) {
  let client = new mongo_grpc_pb.CollectionProxyClient(
    `localhost:${port}`, grpc.credentials.createInsecure()
  );

  return {
    async insertOne(...args) {
      return new Promise((rs, rj) => client.insertOne(...args, (err, res) => {
        if(err) rj(err);
        else rs(res);
      }));
    },

    async insertMany(...args) {
      return new Promise((rs, rj) => client.insertMany(...args, (err, res) => {
        if(err) rj(err);
        else rs(res);
      }));
    },

    async findOne(...args) {
      return new Promise((rs, rj) => client.findOne(...args, (err, res) => {
        if(err) rj(err);
        else rs(res);
      }));
    },

    find(...args) {
      return client.find(...args);
    },

    close() {
      return client.close();
    }
  };
}

function createTestServer() {
  let server = new grpc.Server();
}

async function createTestClientAndServer() {
  let mongoClient = await mongodb.connect("mongodb://localhost/test");
  let mdb = mongoClient.db("test");
  let collection = mdb.collection('test');
  let server = new grpc.Server();

  server.addService(
    mongo_grpc_pb.CollectionProxyService,
    new MongoGrpcCollectionProxy(collection)
  );

  let port = server.bind('0.0.0.0:0', grpc.ServerCredentials.createInsecure());

  server.start();

  let client = createTestClient(port);

  return {server, client, collection};
}

test('InsertOne', async t => {
  let {client, server, collection} = await createTestClientAndServer();

  let request = new mongo_pb.InsertOneRequest();
  let doc = new bson_pb.Document();
  let docKeyValues = doc.getKeyValueMap();

  let testValue = new bson_pb.Value();
  testValue.setString("world");

  docKeyValues.set("hello", testValue);
  
  request.setDocument(doc);

  let response = await client.insertOne(request);

  t.truthy(response.hasInsertedId(), "Response did not included inserted id");

  let dbdoc = await collection.findOne({
    _id: new bson.ObjectID(response.getInsertedId().getId())
  });

  t.truthy(dbdoc, "Couldn't find document after inserting");

  t.is(dbdoc.hello, "world", "Did not store correct value");
});

test('InsertMany', async t => {
  let {client, server, collection} = await createTestClientAndServer();

  let request = new mongo_pb.InsertManyRequest();

  for(let i=0; 50 > i; ++i) {
    let doc = new bson_pb.Document();
    let docKeyValues = doc.getKeyValueMap();

    let testValue = new bson_pb.Value();
    testValue.setString("world");

    docKeyValues.set("hello", testValue);

    request.addDocument(doc);
  }

  let response = await client.insertMany(request);
  let insertedIds = response.getInsertedIdList();

  t.is(insertedIds.length, 50);
});


test('FindOne', async t => {
  let {client, server, collection} = await createTestClientAndServer();
  let result = await collection.insertOne({});
  result = await collection.insertOne({});

  let insertedIdStr = result.insertedId.toString();

  let request = new mongo_pb.FindRequest();
  let query = new mongo_pb.Query();
  let queryKeyValues = query.getKeyValueMap();
  let findIdValue = new bson_pb.Value();
  let findId = new bson_pb.ObjectID();
  findId.setId(insertedIdStr);
  findIdValue.setObjectId(findId);

  queryKeyValues.set('_id', findIdValue);

  request.setQuery(query);

  let foundDoc = await client.findOne(request);

  t.truthy(foundDoc, "findOne returned falsy value");
  t.truthy(foundDoc.hasId(), "findOne returned document without id set");
  t.is(foundDoc.getId().getId(), insertedIdStr, "findOne returned document that does not match _id");
});

test('Find', async t => {
  let {client, server, collection} = await createTestClientAndServer();
  await collection.insertOne({});

  let request = new mongo_pb.FindRequest();

  let stream = client.find(request);

  let resolve, reject;
  let streamPromise = new Promise((rs, rj) => {resolve = rs; reject = rj;});

  stream.on("data", doc => {
    t.truthy(doc);
    t.truthy(doc.hasId());
  });

  stream.on("error", (err) => {
    reject(err);
  });

  stream.on("end", () => {
    resolve();
  });

  await streamPromise;

});

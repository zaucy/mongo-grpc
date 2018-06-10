#!/usr/bin/env node
const argv = require('yargs')
  .usage('Usage: mongo-grpc-proxy <mongodb_connection_uri> [--port=<number>]')
  .usage('> https://docs.mongodb.com/manual/reference/connection-string/')
  .option('port', {
    description: "Grpc port",
    default: 0
  })
  .option('collection', {
    alias: 'c',
    required: true,
    description: "MongoDB collection to read/write from",
  })
  .option('verbose', {
    alias: 'v',
    default: 0,
    count: true,
  })
  .option('no-color', {
    description: "Disables colored output",
    default: false,
  })
  .argv;
  
const colors = require("colors");
const grpc = require("grpc");
const mongodb = require("mongodb");
const {URL} = require("url");
const {CollectionProxyService} = require("../dist/node/mongo_grpc_pb");
const {MongoGrpcCollectionProxy} = require("./proxy");

if(argv['no-color']) {
  colors.disable();
}

const VERBOSE_LEVEL = argv.verbose;
const MONGODB_URI = new URL(argv._[0]);

const ERROR = (...args) => {
  return console.error('[error]'.red, ...args);
}

const FATAL = (...args) => {
  console.error('[fatal]'.red, ...args);
  // require('yargs').showHelpOnFail()
  process.exit(1);
};

const WARN = (...args) => {
  return VERBOSE_LEVEL >= 0 && console.warn('[warn]'.yellow, ...args);
};

const INFO = (...args) => {
  return VERBOSE_LEVEL >= 1 && console.info('[info]'.grey, ...args)
};

const DEBUG = (...args) => {
  return VERBOSE_LEVEL >= 2 && console.debug('[debug]'.blue.bgWhite, ...args);
};

if(MONGODB_URI.protocol != 'mongodb:') {
  FATAL(`Expected 'mongodb:' uri protocol. Got '${MONGODB_URI.protocol}'`);
}

if(!MONGODB_URI.pathname) {
  FATAL(`Missing mongodb uri pathname`);
}

if(MONGODB_URI.pathname.indexOf('/') > 0) {
  FATAL(`Invalid mongodb uri pathname. Cannot contain '/'`);
}

const DATABASE = MONGODB_URI.pathname.substr(1);

function startServer(mongoClient) {
  let server = new grpc.Server();
  let serverCredentials = grpc.ServerCredentials.createInsecure();
  let db = mongoClient.db(DATABASE);
  let collection = db.collection(argv.collection);
  
  server.addService(
    CollectionProxyService,
    new MongoGrpcCollectionProxy(collection)
  );
  
  const boundPort = server.bind(`0.0.0.0:${argv.port}`, serverCredentials);
  server.start();
  
  INFO("Listening on port", boundPort);
}

DEBUG("Connecting to", MONGODB_URI.toString().bold);
DEBUG("Using database:", DATABASE.bold);
DEBUG("Using collection:", argv.collection.bold);

mongodb.connect(MONGODB_URI.toString()).then(mongoClient => {
  return startServer(mongoClient);
})
.catch(err => {
  FATAL(err.message);
});

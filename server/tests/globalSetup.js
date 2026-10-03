import { MongoMemoryServer } from 'mongodb-memory-server';

// Starts ONE in-memory MongoDB for all test files. The first ever run downloads the mongod binary (~1 min).
// To use a MongoDB you already run instead, set TEST_MONGO_URI (e.g. mongodb://127.0.0.1:27017/).
let mongo;

export async function setup(project) {
  if (process.env.TEST_MONGO_URI) return project.provide('mongoUri', process.env.TEST_MONGO_URI);
  mongo = await MongoMemoryServer.create();
  project.provide('mongoUri', mongo.getUri());
}

export async function teardown() {
  await mongo?.stop();
}

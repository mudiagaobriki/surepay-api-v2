import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Load environment variables from .env.test file if it exists, otherwise from .env
dotenv.config({ path: '.env.test' });
if (!process.env.JWT_SECRET) {
  dotenv.config();
}

// Set test environment
process.env.NODE_ENV = 'test';

// Create in-memory MongoDB server
let mongoServer;

// Connect to the in-memory database before running tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  
  console.log(`MongoDB successfully connected to ${mongoUri}`);
});

// Clear all test data after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Disconnect and stop MongoDB server after all tests are done
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  console.log('MongoDB connection closed');
});
const { PrismaClient } = require('./node_modules/.prisma/client-sqlite');

process.env.DATABASE_URL = 'file:./test-dynamic.db';

try {
  console.log("Instantiating PrismaClient with NO options but process.env.DATABASE_URL set...");
  const prisma = new PrismaClient();
  
  // Try to read a model just to see if it connects to the right path
  // Since we don't have sqlite binary, just printing it is enough
  console.log("Success! PrismaClient instantiated. Internal url configuration:");
  console.log(prisma._engineConfig?.datasources || prisma._engine?.datasources);
} catch (e) {
  console.log("Failed: " + e.message);
}

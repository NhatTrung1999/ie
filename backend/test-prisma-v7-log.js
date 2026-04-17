const { PrismaClient } = require('./node_modules/.prisma/client-sqlite');

process.env.DATABASE_URL = 'file:./test-dynamic.db';

try {
  console.log("Instantiating PrismaClient with { log: ['info'] } options but process.env.DATABASE_URL set...");
  const prisma = new PrismaClient({ log: ['info'] });
  
  console.log("Success! PrismaClient instantiated.");
} catch (e) {
  console.log("Failed: " + e.message);
}

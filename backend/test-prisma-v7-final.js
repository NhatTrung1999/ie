const { PrismaClient } = require('./node_modules/.prisma/client-sqlite');
const { PrismaLibSql } = require('@prisma/adapter-libsql');

try {
  console.log("Instantiating PrismaClient with adapter (passing config to factory)...");
  
  // Valid factory pattern
  const adapter = new PrismaLibSql({ url: 'file:./test-dynamic.db' });
  const prisma = new PrismaClient({ adapter });
  
  console.log("Success! PrismaClient instantiated.");
} catch (e) {
  console.log("Failed: " + e.message);
  console.error(e.stack);
}

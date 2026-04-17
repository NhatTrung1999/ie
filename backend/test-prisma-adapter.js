const { PrismaClient } = require('./node_modules/.prisma/client-sqlite');
const { createClient } = require('@libsql/client');
const { PrismaLibSQL } = require('@prisma/adapter-libsql');

try {
  const libsql = createClient({ url: 'file:./test-dynamic.db' });
  const adapter = new PrismaLibSQL(libsql);
  const prisma = new PrismaClient({ adapter });
  console.log("Success! PrismaClient instantiated with adapter.");
} catch (e) {
  console.log("Failed: " + e.message);
}

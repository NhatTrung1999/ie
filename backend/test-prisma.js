const { PrismaClient } = require('./node_modules/.prisma/client-sqlite');

try {
  const client = new PrismaClient();
  console.log('Empty config Success');
} catch (e) {
  console.log('Empty config Failed:', e.message);
}

try {
  const client = new PrismaClient({ url: process.env.DATABASE_URL || 'file:./ie-offline.db' });
  console.log('url config Success');
} catch (e) {
  console.log('url config Failed:', e.message);
}

try {
  const client = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL || 'file:./ie-offline.db' });
  console.log('datasourceUrl config Success');
} catch (e) {
  console.log('datasourceUrl config Failed:', e.message);
}

try {
  const client = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || 'file:./ie-offline.db' } } });
  console.log('datasources config Success');
} catch (e) {
  console.log('datasources config Failed:', e.message);
}

const { PrismaClient } = require('./node_modules/.prisma/client-sqlite');

const variants = [
  { name: 'datasources', config: { datasources: { db: { url: 'file:./test.db' } } } },
  { name: 'datasource', config: { datasource: { url: 'file:./test.db' } } },
  { name: 'datasourceUrl', config: { datasourceUrl: 'file:./test.db' } },
  { name: 'url', config: { url: 'file:./test.db' } },
  { name: 'db', config: { db: { url: 'file:./test.db' } } },
  { name: 'connectionString', config: { connectionString: 'file:./test.db' } },
];

for (const variant of variants) {
  try {
    console.log(`Testing ${variant.name}...`);
    new PrismaClient(variant.config);
    console.log(`  ${variant.name} Success (at least constructor accepted it)`);
  } catch (e) {
    console.log(`  ${variant.name} Failed: ${e.message.split('\n')[0]}`);
  }
}

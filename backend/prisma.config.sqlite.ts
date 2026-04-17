import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.sqlite.prisma',
  datasource: {
    // Chúng ta định nghĩa lại DATABASE_URL ở đây cho SQLite
    url: env('DATABASE_URL') || 'file:./ie-offline.db',
  },
});

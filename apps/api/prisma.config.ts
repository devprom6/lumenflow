import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    directory: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://lumenflow:lumenflow_dev_password@localhost:5432/lumenflow_dev',
  },
});

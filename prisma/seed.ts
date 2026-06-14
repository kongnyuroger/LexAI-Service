import 'dotenv/config';
import { PrismaClient, Plan } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'test@lexai.cm' },
    update: {},
    create: {
      email: 'test@lexai.cm',
      passwordHash,
      fullName: 'Test User',
      plan: Plan.FREE,
    },
  });

  console.log(`Seeded test user: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

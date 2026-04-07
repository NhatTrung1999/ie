const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const existing = await prisma.user.findUnique({
    where: { username: 'administrator' },
  });

  if (existing) {
    await prisma.user.update({
      where: { username: 'administrator' },
      data: {
        displayName: 'Administrator',
      },
    });
    return;
  }

  await prisma.user.create({
    data: {
      username: 'administrator',
      passwordHash: hashPassword('password'),
      displayName: 'Administrator',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

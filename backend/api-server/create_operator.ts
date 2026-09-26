import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const phone = '+917907793657';
  const username = 'adarsh_op';
  const password = 'ad123';
  
  const password_hash = await bcrypt.hash(password, 10);
  
  const user = await prisma.user.upsert({
    where: { username },
    update: {
      phone: phone,
      password_hash,
      role: Role.Operator,
      isActive: true,
    },
    create: {
      username: username,
      email: 'adarsh_op@mercon.tech',
      phone: phone,
      password_hash,
      name: 'Adarsh',
      role: Role.Operator,
      isActive: true,
    },
  });
  
  console.log(`✅ Successfully created operator account!\nUsername: ${user.username}\nPhone: ${user.phone}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

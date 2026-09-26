import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.customer.updateMany({
    data: {
      name: "Gulf Cement Supply"
    }
  });

  console.log("Database updated: Renamed customers to Gulf Cement Supply.");
}

main().catch(console.error).finally(() => prisma.$disconnect());

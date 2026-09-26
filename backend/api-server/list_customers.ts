import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const customers = await prisma.customer.findMany()
  console.log("CUSTOMERS:", customers.map(c => c.name))
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

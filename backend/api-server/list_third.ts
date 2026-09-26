import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tpp = await prisma.thirdPartyProvider.findMany()
  console.log("3PLs:", tpp.map(c => c.name))
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

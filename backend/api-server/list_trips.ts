import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const docs = await prisma.trip.findMany()
  console.log("TRIPS:", docs.map(d => d.customer_name))
}
main().catch(console.error).finally(() => prisma.$disconnect())

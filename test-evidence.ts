import { prisma } from './backend/api-server/src/db';
import { getPublicTripEvidence } from './backend/api-server/src/controllers/publicController';

async function test() {
  const req = { query: { ref: 'TRP-0253' } } as any;
  const res = {
    status: (code: number) => ({
      json: (data: any) => console.log('STATUS', code, JSON.stringify(data, null, 2))
    }),
    json: (data: any) => console.log('JSON', JSON.stringify(data, null, 2))
  } as any;
  await getPublicTripEvidence(req, res);
}
test().catch(console.error).finally(() => prisma.$disconnect());

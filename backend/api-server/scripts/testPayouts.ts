import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
dotenv.config();

const token = jwt.sign(
  { id: 'fake-admin-id', role: 'Admin', username: 'admin' }, 
  process.env.JWT_SECRET || 'change-me-in-production', 
  { expiresIn: '1h' }
);
try {
  const output = execSync(`PORT=4001 npx ts-node --transpile-only src/index.ts & sleep 7 && curl -s -w "\\nHTTP %{http_code}\\n" -H "Authorization: Bearer ${token}" "http://localhost:4001/api/drivers/payouts?driverIds=123" && kill $!`, { encoding: 'utf-8' });
  console.log(output);
} catch (e: any) {
  console.log("Error running curl:", e.message);
}

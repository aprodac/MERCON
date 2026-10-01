-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentAccountId" UUID;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "defaultExpenseAccountId" UUID,
ADD COLUMN     "expenseAccountMap" JSONB;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;


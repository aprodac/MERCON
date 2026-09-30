-- Contra entries (cash/bank transfers): the deposit slip, cheque or transfer number.
-- Additive and nullable: existing journal entries are untouched.
ALTER TABLE "JournalEntry" ADD COLUMN "reference" TEXT;

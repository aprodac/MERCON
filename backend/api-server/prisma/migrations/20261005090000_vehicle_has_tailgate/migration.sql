-- Trucks with a tailgate lift. The operator app's trip assignment message to
-- the customer adds "WITH TAILGATE" when the assigned truck has one. Additive,
-- defaults to false for every existing truck.
ALTER TABLE "Vehicle" ADD COLUMN "has_tailgate" BOOLEAN NOT NULL DEFAULT false;

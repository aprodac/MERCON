-- Planned drive time per customer route and truck class, set from the operator app's Transit times page.
CREATE TABLE "customer_route_transits" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "origin_key" TEXT NOT NULL,
    "destination_key" TEXT NOT NULL,
    "leg" TEXT NOT NULL DEFAULT 'out',
    "truck_class" TEXT NOT NULL,
    "planned_minutes" INTEGER NOT NULL,
    "updated_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_route_transits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_route_transits_customerId_origin_key_destination_k_key" ON "customer_route_transits"("customerId", "origin_key", "destination_key", "leg", "truck_class");
CREATE INDEX "customer_route_transits_customerId_idx" ON "customer_route_transits"("customerId");

ALTER TABLE "customer_route_transits" ADD CONSTRAINT "customer_route_transits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

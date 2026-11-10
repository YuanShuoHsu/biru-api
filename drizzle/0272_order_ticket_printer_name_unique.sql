WITH "ranked" AS (
  SELECT "id", "organization_id", "name", ROW_NUMBER() OVER (
    PARTITION BY "organization_id", "name" ORDER BY "created_at", "id"
  ) AS "rn"
  FROM "printer"
  WHERE "purpose" = 'orderTicket' AND "name" IS NOT NULL
),
"duplicate" AS (
  SELECT * FROM "ranked" WHERE "rn" > 1
),
"free_name" AS (
  SELECT g."organization_id", g."name", c."candidate", ROW_NUMBER() OVER (
    PARTITION BY g."organization_id", g."name" ORDER BY n
  ) AS "slot"
  FROM (
    SELECT "organization_id", "name", COUNT(*) AS "total"
    FROM "duplicate"
    GROUP BY "organization_id", "name"
  ) g
  CROSS JOIN LATERAL generate_series(
    2,
    g."total" + 1 + (SELECT COUNT(*) FROM "printer" p WHERE p."organization_id" = g."organization_id" AND p."purpose" = 'orderTicket')
  ) n
  CROSS JOIN LATERAL (
    SELECT left(g."name", 50 - length(' (' || n || ')')) || ' (' || n || ')' AS "candidate"
  ) c
  WHERE NOT EXISTS (
    SELECT 1 FROM "printer" p
    WHERE p."organization_id" = g."organization_id" AND p."purpose" = 'orderTicket' AND p."name" = c."candidate"
  )
)
UPDATE "printer" p SET "name" = f."candidate", "updated_at" = now()
FROM "duplicate" d
JOIN "free_name" f ON f."organization_id" = d."organization_id" AND f."name" = d."name" AND f."slot" = d."rn" - 1
WHERE p."id" = d."id";--> statement-breakpoint
CREATE UNIQUE INDEX "printer_organizationId_orderTicket_name_idx" ON "printer" USING btree ("organization_id","name") WHERE "printer"."purpose" = 'orderTicket';

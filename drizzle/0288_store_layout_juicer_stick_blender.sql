UPDATE "store_layout"
SET
  "data" = jsonb_set(
    "data",
    '{items}',
    ("data" -> 'items') || '[{"depth":0.25,"elevation":0.9,"floor":"ground","height":0.52,"kind":"equipment","label":"juicer","width":0.22,"x":12.86,"z":2.2},{"depth":0.14,"elevation":1,"floor":"ground","height":0.68,"kind":"equipment","label":"stickBlender","width":0.14,"x":8.7,"z":0}]'::jsonb
  ),
  "updated_at" = now()
WHERE "organization_id" = (SELECT "id" FROM "organization" WHERE "slug" = 'biru')
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("data" -> 'items') AS item
    WHERE item ->> 'label' IN ('juicer', 'stickBlender')
  );

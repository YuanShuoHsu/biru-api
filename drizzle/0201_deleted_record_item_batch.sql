-- 批次刪除在同一交易內逐筆刪，各筆要能分開還原，所以由應用層指定批號；負數不會與 txid 撞號
CREATE SEQUENCE IF NOT EXISTS "public"."deleted_record_batch_seq";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."record_deleted_row"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  data jsonb := to_jsonb(OLD);
BEGIN
  IF current_setting('app.skip_deleted_record', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'account' THEN
    data := data - 'access_token' - 'refresh_token' - 'id_token';
  END IF;

  INSERT INTO "public"."deleted_record" ("batch_id", "table_name", "record_id", "data")
  VALUES (
    COALESCE(NULLIF(current_setting('app.deleted_record_batch', true), '')::bigint, txid_current()),
    TG_TABLE_NAME,
    data ->> 'id',
    data
  );
  RETURN OLD;
END;
$$;

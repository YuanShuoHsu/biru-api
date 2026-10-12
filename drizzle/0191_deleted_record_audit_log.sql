-- 排程清理以 set_config('app.skip_deleted_record', 'on', true) 標記，只在該交易內有效
CREATE OR REPLACE FUNCTION "public"."record_deleted_row"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.skip_deleted_record', true) = 'on' THEN
    RETURN OLD;
  END IF;

  INSERT INTO "public"."deleted_record" ("batch_id", "table_name", "record_id", "data")
  VALUES (txid_current(), TG_TABLE_NAME, to_jsonb(OLD) ->> 'id', to_jsonb(OLD));
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();

-- 目前的排除清單以 src/deleted-records/deleted-record-tables.ts 的 UNTRACKED_TABLES 為準；audit_log 於 0191 補掛
CREATE OR REPLACE FUNCTION "public"."record_deleted_row"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "public"."deleted_record" ("batch_id", "table_name", "record_id", "data")
  VALUES (txid_current(), TG_TABLE_NAME, to_jsonb(OLD) ->> 'id', to_jsonb(OLD));
  RETURN OLD;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  target text;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'deleted_record',
        'session',
        'verification',
        'audit_log',
        'attendance_audit',
        'ecpay_callback_log',
        'statutory_holiday',
        'payroll_rule_set'
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER record_deleted_row BEFORE DELETE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"()',
      target
    );
  END LOOP;
END;
$$;

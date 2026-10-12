-- OAuth token 可向供應商換發存取權，留存只增加外洩風險；還原後重新登入即會取得新 token
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
  VALUES (txid_current(), TG_TABLE_NAME, data ->> 'id', data);
  RETURN OLD;
END;
$$;

UPDATE "banner"
SET
  "url" = regexp_replace("url", '^/(?:en|ja|ko|zh-cn|zh-tw)(?:/+|(?=[?#]|$))', '/', 'i'),
  "updated_at" = now()
WHERE "url" ~* '^/(?:en|ja|ko|zh-cn|zh-tw)(?:[/?#]|$)';

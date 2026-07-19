-- Session cookies store a stable family secret and a rotating token. D1 keeps
-- only their HMAC digests in token_hash as "family.token". The expression
-- index makes family-wide logout efficient while legacy single-digest rows are
-- upgraded atomically by their first successful resume.

CREATE INDEX idx_sessions_token_family
ON sessions(substr(token_hash, 1, 64))
WHERE length(token_hash) = 129 AND substr(token_hash, 65, 1) = '.';

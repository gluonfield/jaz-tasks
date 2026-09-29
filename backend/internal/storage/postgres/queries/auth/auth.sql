-- name: UserByAPIKey :one
SELECT users.* FROM api_keys
JOIN users ON users.id = api_keys.user_id
WHERE api_keys.key_hash = $1 AND users.active;

-- name: CreateAPIKey :exec
INSERT INTO api_keys (user_id, label, key_hash) VALUES ($1, $2, $3);

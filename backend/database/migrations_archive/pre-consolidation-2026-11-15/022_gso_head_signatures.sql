-- A GSO Head's ready-to-use signature. It is placed on the purchase requisition PDF sent to Finance.
-- One row per account; uploading again replaces the image.
BEGIN;

CREATE TABLE IF NOT EXISTS user_signatures (
    user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    image BYTEA NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    image_sha256 TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_signatures_image_size CHECK (octet_length(image) <= 307200),
    CONSTRAINT user_signatures_dimensions CHECK (width > 0 AND height > 0)
);

COMMIT;

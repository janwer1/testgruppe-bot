-- Create the main table for storing requests as JSON objects
CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
);

-- Indexes for efficient querying on JSON fields
CREATE INDEX IF NOT EXISTS idx_requests_userId ON requests(json_extract(data, '$.json.userId'));
CREATE INDEX IF NOT EXISTS idx_requests_requestId ON requests(json_extract(data, '$.json.requestId'));
CREATE INDEX IF NOT EXISTS idx_requests_decisionStatus ON requests(json_extract(data, '$.json.decisionStatus'));
CREATE INDEX IF NOT EXISTS idx_requests_adminMsgId ON requests(json_extract(data, '$.json.adminMsgId'));

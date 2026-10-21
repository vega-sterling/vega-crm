#!/bin/bash
set -e
docker exec -i vega-crm-db psql -U vega_crm -d vega_crm -P pager=off <<'SQL'
INSERT INTO users (id, email, name, "passwordHash", "globalRole", "isActive", "totpEnabled", "failedLoginAttempts", "createdAt", "updatedAt")
VALUES ('qa-user-nightly', 'qa-nightly@vega.local', 'QA Nightly', '$2b$10$pi0Njw3x/PqfYdPdeJBLeOAzYfh2qwwREelmbRHPjYahBmBBOZEIW', 'ADMIN', true, false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
INSERT INTO user_tenants (id, "userId", "tenantId", "createdAt")
VALUES ('qa-ut-nightly', 'qa-user-nightly', 'cmrxshared0000vegahq01', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
SQL

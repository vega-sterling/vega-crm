SELECT id, "tenantId", name, position FROM pipeline_stages WHERE "tenantId" = (SELECT id FROM tenants LIMIT 1) ORDER BY position LIMIT 3;
SELECT id, name, "tenantId" FROM companies WHERE "tenantId" = (SELECT id FROM tenants LIMIT 1) ORDER BY "createdAt" DESC LIMIT 1;
SELECT id, "firstName", "lastName", "tenantId", "companyId" FROM contacts WHERE "companyId" = (SELECT id FROM companies WHERE "tenantId" = (SELECT id FROM tenants LIMIT 1) ORDER BY "createdAt" DESC LIMIT 1) LIMIT 1;
SELECT id, name, "tenantId" FROM users WHERE "tenantId" = (SELECT id FROM tenants LIMIT 1) LIMIT 1;
SELECT id, "firstName", "lastName" FROM contacts LIMIT 1;
SELECT id, name FROM companies LIMIT 1;
SELECT id, name FROM users LIMIT 1;
SELECT id, name, "tenantId", position FROM pipeline_stages ORDER BY "createdAt" DESC LIMIT 1;

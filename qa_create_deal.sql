INSERT INTO deals (id, "tenantId", title, "companyId", "stageId", value, currency, probability, status, "assignedToId", "createdById")
VALUES ('qa-deal-nightly-20260918', 'cmrxshared0000vegahq01', 'Nightly QA Deal', '72a35f40-c3e1-4aff-8b90-099f022baa04', 'c8f350b447710f1ae84f1a834', 100000, 'USD', 50, 'OPEN', 'cmrxknens00039nph8q7kzo30', 'cmrxknens00039nph8q7kzo30');
SELECT id, title, status, value FROM deals WHERE id='qa-deal-nightly-20260918';

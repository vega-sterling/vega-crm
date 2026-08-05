export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const LeadFormCreateSchema = z.object({
  tenantId: z.cuid(),
  name: z.string().min(1, 'Form name is required'),
  fields: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'hidden']),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(),
  })),
  redirectUrl: z.url().optional().nullable(),
  webhookUrl: z.url().optional().nullable(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return NextResponse.json({ data: [] });
  const forms = await prisma.leadForm.findMany({
    where: { tenantId: tenantIds ? { in: tenantIds } : undefined },
    include: { _count: { select: { submissions: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ data: forms });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const body = await validateBody(req, LeadFormCreateSchema);
  if (body instanceof NextResponse) return body;
  const baseSlug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.leadForm.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`;
  }
  const form = await prisma.leadForm.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      slug,
      fields: body.fields,
      redirectUrl: body.redirectUrl || null,
      webhookUrl: body.webhookUrl || null,
    },
  });
  return NextResponse.json({ data: form }, { status: 201 });
}
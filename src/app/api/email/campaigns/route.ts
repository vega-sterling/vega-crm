export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session'
import { validateBody } from '@/lib/validation'

const CampaignCreateSchema = z.object({
  tenantId: z.cuid(),
  name: z.string().min(1, 'Campaign name is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Email body is required'),
  templateId: z.cuid().optional().nullable(),
  audienceFilter: z.any().optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session

  const tenantIds = await getAccessibleTenantIds(session)
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  const where = { tenantId: tenantIds ? { in: tenantIds } : undefined }

  const [data, total] = await Promise.all([
    prisma.emailCampaign.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { recipients: true } },
      },
    }),
    prisma.emailCampaign.count({ where }),
  ])

  return NextResponse.json({ data, pagination: { page, limit, total } })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session

  const body = await validateBody(req, CampaignCreateSchema)
  if (body instanceof NextResponse) return body

  const tenantIds = await getAccessibleTenantIds(session)
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Access denied to this tenant', 403)
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      tenantId: body.tenantId,
      name: body.name,
      subject: body.subject,
      body: body.body,
      templateId: body.templateId || null,
      audienceFilter: body.audienceFilter || null,
      scheduledAt: body.scheduledAt || null,
      status: body.scheduledAt ? 'SCHEDULED' : 'DRAFT',
    },
  })

  return NextResponse.json({ data: campaign })
}
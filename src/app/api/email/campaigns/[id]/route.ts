export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session
  const { id } = await params

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
    include: { recipients: { take: 50, orderBy: { sentAt: 'desc' } } },
  })
  if (!campaign) return errorResponse('Campaign not found', 404)

  const tenantIds = await getAccessibleTenantIds(session)
  if (tenantIds && !tenantIds.includes(campaign.tenantId)) return errorResponse('Access denied', 403)

  return NextResponse.json({ data: campaign })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session
  const { id } = await params
  const body = await req.json()

  const campaign = await prisma.emailCampaign.findUnique({ where: { id } })
  if (!campaign) return errorResponse('Campaign not found', 404)
  const tenantIds = await getAccessibleTenantIds(session)
  if (tenantIds && !tenantIds.includes(campaign.tenantId)) return errorResponse('Access denied', 403)

  const updated = await prisma.emailCampaign.update({
    where: { id },
    data: {
      name: body.name,
      subject: body.subject,
      body: body.body,
      status: body.status,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    },
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await requireSession(req)
  if (session instanceof NextResponse) return session
  const { id } = await params

  const campaign = await prisma.emailCampaign.findUnique({ where: { id } })
  if (!campaign) return errorResponse('Campaign not found', 404)
  const tenantIds = await getAccessibleTenantIds(session)
  if (tenantIds && !tenantIds.includes(campaign.tenantId)) return errorResponse('Access denied', 403)

  await prisma.emailCampaign.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

  const form = await prisma.leadForm.findUnique({
    where: { slug },
    select: { id: true, name: true, fields: true, redirectUrl: true, isActive: true },
  });

  if (!form || !form.isActive) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  return NextResponse.json({ data: form });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Slug required' }, { status: 400 });

    const form = await prisma.leadForm.findUnique({ where: { slug } });
    if (!form || !form.isActive) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const body = await req.json();
    if (body._honeypot) return NextResponse.json({ ok: true });

    const email = body.email || '';
    const name = body.name || '';
    const phone = body.phone || '';
    const company = body.company || '';

    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const ip = req.headers.get('x-forwarded-for') || null;
    const ua = req.headers.get('user-agent') || null;

    let companyId: string | undefined;
    if (company) {
      const existing = await prisma.company.findFirst({
        where: { tenantId: form.tenantId, name: { contains: company, mode: 'insensitive' } },
      });
      if (existing) companyId = existing.id;
      else {
        const newCo = await prisma.company.create({ data: { tenantId: form.tenantId, name: company } });
        companyId = newCo.id;
      }
    } else {
      const defaultCo = await prisma.company.findFirst({ where: { tenantId: form.tenantId } });
      if (defaultCo) companyId = defaultCo.id;
      else {
        const newCo = await prisma.company.create({ data: { tenantId: form.tenantId, name: 'General' } });
        companyId = newCo.id;
      }
    }

    let contact = await prisma.contact.findFirst({ where: { email } });
    if (!contact) {
      const [firstName, ...rest] = name.split(' ');
      contact = await prisma.contact.create({
        data: {
          tenantId: form.tenantId,
          companyId,
          firstName: firstName || name,
          lastName: rest.join(' ') || '',
          email,
          phone: phone || null,
        },
      });
    }

    await prisma.leadFormSubmission.create({
      data: {
        formId: form.id,
        data: body,
        contactId: contact.id,
        ipAddress: ip,
        userAgent: ua,
      },
    });

    if (form.webhookUrl) {
      try {
        await fetch(form.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ form: form.name, data: body, contactId: contact.id }),
        });
      } catch {}
    }

    return NextResponse.json({ ok: true, contactId: contact.id });
  } catch {
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
  }
}
/**
 * ============================================================================
 * Seed Script — Vega CRM
 * ============================================================================
 * Creates initial data for the CRM:
 * - 3 Tenants: MDU Solutions, Flying Mushroom, Velanra
 * - 1 Super Admin user (Bryan Paulk)
 * - Sample companies and contacts for each tenant
 *
 * Usage: npx prisma db seed
 * ============================================================================
 */

import { PrismaClient, GlobalRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Vega CRM database...");

  // ========================================================================
  // Create Tenants
  // ========================================================================
  const tenants = await Promise.all([
    prisma.tenant.upsert({
      where: { slug: "mdu-solutions" },
      update: {},
      create: {
        name: "MDU Solutions",
        slug: "mdu-solutions",
        description: "Telecom, IPTV, and property technology solutions",
      },
    }),
    prisma.tenant.upsert({
      where: { slug: "flying-mushroom" },
      update: {},
      create: {
        name: "Flying Mushroom",
        slug: "flying-mushroom",
        description: "Colorado gourmet and functional mushroom cultivation",
      },
    }),
    prisma.tenant.upsert({
      where: { slug: "velanra" },
      update: {},
      create: {
        name: "Velanra",
        slug: "velanra",
        description: "Wellness ecosystem and retreats",
      },
    }),
  ]);

  console.log(`Created ${tenants.length} tenants`);

  // ========================================================================
  // Create Super Admin User (Bryan)
  // ========================================================================
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);
  const bryan = await prisma.user.upsert({
    where: { email: "bryan@paulk.org" },
    update: {},
    create: {
      email: "bryan@paulk.org",
      name: "Bryan Paulk",
      passwordHash,
      globalRole: GlobalRole.SUPER_ADMIN,
    },
  });

  console.log(`Created super admin: ${bryan.email}`);

  // ========================================================================
  // Create Admin User (Leon)
  // ========================================================================
  const leonPassword = await bcrypt.hash("ChangeMe123!", 12);
  const leon = await prisma.user.upsert({
    where: { email: "leon@mdusolutions.com" },
    update: {},
    create: {
      email: "leon@mdusolutions.com",
      name: "Leon",
      passwordHash: leonPassword,
      globalRole: GlobalRole.ADMIN,
    },
  });

  // Assign Leon to MDU Solutions and Flying Mushroom (not Velanra)
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: leon.id, tenantId: tenants[0].id } },
    update: {},
    create: { userId: leon.id, tenantId: tenants[0].id },
  });
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: leon.id, tenantId: tenants[1].id } },
    update: {},
    create: { userId: leon.id, tenantId: tenants[1].id },
  });

  console.log(`Created admin: ${leon.email} (MDU + FM access)`);

  // ========================================================================
  // Create User (Bob)
  // ========================================================================
  const bobPassword = await bcrypt.hash("ChangeMe123!", 12);
  const bob = await prisma.user.upsert({
    where: { email: "bob@mdusolutions.com" },
    update: {},
    create: {
      email: "bob@mdusolutions.com",
      name: "Bob",
      passwordHash: bobPassword,
      globalRole: GlobalRole.USER,
    },
  });

  // Assign Bob to MDU Solutions only
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: bob.id, tenantId: tenants[0].id } },
    update: {},
    create: { userId: bob.id, tenantId: tenants[0].id },
  });

  console.log(`Created user: ${bob.email} (MDU access only)`);

  // ========================================================================
  // Create Sample Companies
  // ========================================================================
  const mduCompany = await prisma.company.create({
    data: {
      tenantId: tenants[0].id,
      name: "Test Property Management",
      industry: "Property Management",
      phone: "555-0100",
      email: "info@testprop.com",
      description: "Sample property management company for MDU demo",
    },
  });

  const fmCompany = await prisma.company.create({
    data: {
      tenantId: tenants[1].id,
      name: "Wellness Dispensary",
      industry: "Retail / Wellness",
      phone: "555-0200",
      email: "contact@wellnessdisp.com",
      description: "Potential wholesale customer for Flying Mushroom",
    },
  });

  const velanraCompany = await prisma.company.create({
    data: {
      tenantId: tenants[2].id,
      name: "Retreat Partners LLC",
      industry: "Wellness / Retreats",
      phone: "555-0300",
      email: "hello@retrpartners.com",
      description: "Retreat venue partnership",
    },
  });

  console.log("Created 3 sample companies");

  // ========================================================================
  // Create Sample Contacts
  // ========================================================================
  await prisma.contact.create({
    data: {
      companyId: mduCompany.id,
      tenantId: tenants[0].id,
      firstName: "John",
      lastName: "Smith",
      email: "john@testprop.com",
      phone: "555-0101",
      title: "Property Manager",
    },
  });

  await prisma.contact.create({
    data: {
      companyId: fmCompany.id,
      tenantId: tenants[1].id,
      firstName: "Sarah",
      lastName: "Johnson",
      email: "sarah@wellnessdisp.com",
      phone: "555-0201",
      title: "Buyer",
    },
  });

  await prisma.contact.create({
    data: {
      companyId: velanraCompany.id,
      tenantId: tenants[2].id,
      firstName: "Michael",
      lastName: "Brown",
      email: "michael@retrpartners.com",
      phone: "555-0301",
      title: "Operations Director",
    },
  });

  console.log("Created 3 sample contacts");
  console.log("\nSeed complete!");
  console.log("\nLogin credentials:");
  console.log("  Super Admin: bryan@paulk.org / ChangeMe123!");
  console.log("  Admin:       leon@mdusolutions.com / ChangeMe123!");
  console.log("  User:        bob@mdusolutions.com / ChangeMe123!");
  console.log("\n⚠️  Change all passwords immediately after first login!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
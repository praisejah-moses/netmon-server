import { PrismaService } from "../src/services/prisma/prisma.service";
import * as argon2 from "argon2";

const prisma = new PrismaService();

async function main() {
  console.log("Seeding database...");

  // Create system admin
  const adminPassword = await argon2.hash("admin123");
  const admin = await prisma.user.upsert({
    where: { email: "admin@networkmonitor.dev" },
    update: {},
    create: {
      email: "admin@networkmonitor.dev",
      passwordHash: adminPassword,
      firstName: "System",
      lastName: "Admin",
      role: "SYSTEM_ADMIN",
    },
  });
  console.log(`Created admin: ${admin.email}`);

  // Create sample organization
  const org = await prisma.organization.create({
    data: {
      name: "Demo Organization",
      contactEmail: "demo@example.com",
    },
  });
  console.log(`Created organization: ${org.name}`);

  // Create org admin
  const orgAdminPassword = await argon2.hash("orgadmin123");
  const orgAdmin = await prisma.user.create({
    data: {
      email: "orgadmin@demo.com",
      passwordHash: orgAdminPassword,
      firstName: "Org",
      lastName: "Admin",
      role: "ORG_ADMIN",
      organizationId: org.id,
    },
  });
  console.log(`Created org admin: ${orgAdmin.email}`);

  // Create sample VPN config
  const vpn = await prisma.vpnConfig.create({
    data: {
      organizationId: org.id,
      protocol: "WIREGUARD",
      interfaceName: "wg0",
      subnet: "10.10.0.0/24",
      endpoint: "203.0.113.1:51820",
      status: "DISCONNECTED",
    },
  });
  console.log(`Created VPN config: ${vpn.interfaceName}`);

  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

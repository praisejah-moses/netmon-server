import { Test, TestingModule } from "@nestjs/testing";
import { OrganizationsService } from "./organizations.service";
import { PrismaService } from "../../services/prisma/prisma.service";
import { NotFoundException } from "@nestjs/common";

describe("OrganizationsService", () => {
  let service: OrganizationsService;
  let prisma: PrismaService;

  const mockOrg = {
    id: "org-1",
    name: "Test Org",
    contactEmail: "admin@testorg.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: {
            organization: {
              create: jest.fn().mockResolvedValue(mockOrg),
              findMany: jest.fn().mockResolvedValue([mockOrg]),
              findUnique: jest.fn(),
              update: jest.fn().mockResolvedValue(mockOrg),
              delete: jest.fn().mockResolvedValue(mockOrg),
              count: jest.fn().mockResolvedValue(1),
            },
          },
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("should create an organization", async () => {
      const result = await service.create({
        name: "Test Org",
        contactEmail: "admin@testorg.com",
      });
      expect(result).toEqual(mockOrg);
    });
  });

  describe("findOne", () => {
    it("should return an organization", async () => {
      jest
        .spyOn(prisma.organization, "findUnique")
        .mockResolvedValue(mockOrg as any);
      const result = await service.findOne("org-1");
      expect(result.name).toBe("Test Org");
    });

    it("should throw NotFoundException for non-existent org", async () => {
      jest.spyOn(prisma.organization, "findUnique").mockResolvedValue(null);
      await expect(service.findOne("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

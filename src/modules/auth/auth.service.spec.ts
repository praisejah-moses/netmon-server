import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../services/prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockUser = {
    id: "user-1",
    email: "test@example.com",
    passwordHash: "",
    firstName: "Test",
    lastName: "User",
    role: "VIEWER",
    organizationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await argon2.hash("password123");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue("mock-jwt-token"),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("login", () => {
    it("should return tokens on successful login", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);

      const result = await service.login({
        email: "test@example.com",
        password: "password123",
      });

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("user");
      expect(result.user.email).toBe("test@example.com");
    });

    it("should throw UnauthorizedException for invalid email", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

      await expect(
        service.login({ email: "wrong@example.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for invalid password", async () => {
      jest.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);

      await expect(
        service.login({ email: "test@example.com", password: "wrongpassword" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

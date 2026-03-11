import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../services/prisma/prisma.service";
import { CryptoService } from "../../services/crypto/crypto.service";
import { CreateRouterDto, UpdateRouterDto } from "./dto/router.dto";
import { RouterStatus } from "@prisma/client";

@Injectable()
export class RoutersService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async create(organizationId: string, dto: CreateRouterDto) {
    const router = await this.prisma.router.create({
      data: {
        organizationId,
        routerName: dto.routerName,
        ipAddress: dto.ipAddress,
        protocol: dto.protocol,
        vendor: dto.vendor,
        osType: dto.osType,
        apiPort: dto.apiPort,
        sshPort: dto.sshPort ?? 22,
        netconfPort: dto.netconfPort ?? 830,
        vpnInterface: dto.vpnInterface,
        pollingInterval: dto.pollingInterval ?? 5,
        credential: {
          create: {
            username: dto.username,
            passwordEncrypted: this.crypto.encrypt(dto.password),
            sshKeyEncrypted: dto.sshKey
              ? this.crypto.encrypt(dto.sshKey)
              : null,
            enablePassword: dto.enablePassword
              ? this.crypto.encrypt(dto.enablePassword)
              : null,
            snmpVersion: dto.snmpVersion,
            snmpCommunity: dto.snmpCommunity
              ? this.crypto.encrypt(dto.snmpCommunity)
              : null,
            snmpAuthProtocol: dto.snmpAuthProtocol,
            snmpPrivProtocol: dto.snmpPrivProtocol,
          },
        },
      },
      include: { credential: { select: { id: true, username: true } } },
    });

    return router;
  }

  async findAll(organizationId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { organizationId };

    const [data, total] = await Promise.all([
      this.prisma.router.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          routerName: true,
          ipAddress: true,
          protocol: true,
          apiPort: true,
          vpnInterface: true,
          pollingInterval: true,
          status: true,
          lastPolledAt: true,
          createdAt: true,
        },
      }),
      this.prisma.router.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      include: {
        credential: { select: { id: true, username: true, snmpVersion: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!router) throw new NotFoundException(`Router ${id} not found`);
    return router;
  }

  async update(id: string, dto: UpdateRouterDto) {
    await this.findOne(id);
    return this.prisma.router.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.router.delete({ where: { id } });
  }

  async updateStatus(id: string, status: RouterStatus) {
    return this.prisma.router.update({
      where: { id },
      data: { status, lastPolledAt: new Date() },
    });
  }

  async getRouterWithCredentials(id: string) {
    const router = await this.prisma.router.findUnique({
      where: { id },
      include: { credential: true },
    });
    if (!router) throw new NotFoundException(`Router ${id} not found`);
    if (router.credential) {
      router.credential.passwordEncrypted = this.crypto.decrypt(
        router.credential.passwordEncrypted,
      );
      if (router.credential.sshKeyEncrypted) {
        router.credential.sshKeyEncrypted = this.crypto.decrypt(
          router.credential.sshKeyEncrypted,
        );
      }
      if (router.credential.enablePassword) {
        router.credential.enablePassword = this.crypto.decrypt(
          router.credential.enablePassword,
        );
      }
      if (router.credential.snmpCommunity) {
        router.credential.snmpCommunity = this.crypto.decrypt(
          router.credential.snmpCommunity,
        );
      }
      if (router.credential.snmpAuthKey) {
        router.credential.snmpAuthKey = this.crypto.decrypt(
          router.credential.snmpAuthKey,
        );
      }
      if (router.credential.snmpPrivKey) {
        router.credential.snmpPrivKey = this.crypto.decrypt(
          router.credential.snmpPrivKey,
        );
      }
    }
    return router;
  }
}

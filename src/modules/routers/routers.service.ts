import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../services/prisma/prisma.service";
import { CryptoService } from "../../services/crypto/crypto.service";
import { CreateRouterDto, UpdateRouterDto } from "./dto/router.dto";
import { RouterStatus, VpnStatus } from "../../../generated/prisma/client.js";

@Injectable()
export class RoutersService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  /**
   * Onboard a device for an organisation.
   *
   * VPN resolution order:
   *   1. If `vpnConfigId` is supplied → validate it belongs to the org and link it.
   *   2. Else if an inline `vpnConfig` object is supplied → create the VpnConfig
   *      for the org first, then link it.
   *   3. Otherwise → device is treated as directly reachable (no VPN tracking).
   */
  async create(organizationId: string, dto: CreateRouterDto) {
    let resolvedVpnConfigId: string | null = null;

    if (dto.vpnConfigId) {
      // Validate the referenced VpnConfig belongs to this organisation
      const existing = await this.prisma.vpnConfig.findFirst({
        where: { id: dto.vpnConfigId, organizationId },
        select: { id: true },
      });
      if (!existing) {
        throw new BadRequestException(
          `VPN config ${dto.vpnConfigId} not found for this organisation`,
        );
      }
      resolvedVpnConfigId = existing.id;
    } else if (dto.vpnConfig) {
      // Create the VPN config inline and link it to this device
      const created = await this.prisma.vpnConfig.create({
        data: {
          organizationId,
          protocol: dto.vpnConfig.protocol,
          interfaceName: dto.vpnConfig.interfaceName,
          subnet: dto.vpnConfig.subnet,
          endpoint: dto.vpnConfig.endpoint ?? null,
          publicKey: dto.vpnConfig.publicKey ?? null,
          configData: dto.vpnConfig.configData
            ? this.crypto.encrypt(dto.vpnConfig.configData)
            : null,
          status: VpnStatus.DISCONNECTED,
        },
        select: { id: true },
      });
      resolvedVpnConfigId = created.id;
    }

    const router = (await this.prisma.router.create({
      data: {
        organizationId,
        routerName: dto.routerName,
        ipAddress: dto.ipAddress,
        protocol: dto.protocol,
        vendor: dto.vendor,
        osType: dto.osType,
        apiPort: dto.apiPort ?? 8729,
        sshPort: dto.sshPort ?? 22,
        netconfPort: dto.netconfPort ?? 830,
        vpnInterface: null,
        pollingInterval: dto.pollingInterval ?? 5,
        ...(resolvedVpnConfigId
          ? { vpnConfig: { connect: { id: resolvedVpnConfigId } } }
          : {}),
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
            snmpAuthKey: dto.snmpAuthKey
              ? this.crypto.encrypt(dto.snmpAuthKey)
              : null,
            snmpPrivKey: dto.snmpPrivKey
              ? this.crypto.encrypt(dto.snmpPrivKey)
              : null,
          },
        },
      } as any,
      include: {
        credential: { select: { id: true, username: true } },
        vpnConfig: {
          select: {
            id: true,
            protocol: true,
            interfaceName: true,
            endpoint: true,
            status: true,
          },
        },
      } as any,
    })) as any;

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
          vendor: true,
          apiPort: true,
          pollingInterval: true,
          status: true,
          lastPolledAt: true,
          createdAt: true,
          vpnConfig: {
            select: {
              id: true,
              protocol: true,
              interfaceName: true,
              endpoint: true,
              status: true,
            },
          },
        } as any,
      } as any),
      this.prisma.router.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const router = (await this.prisma.router.findUnique({
      where: { id },
      include: {
        credential: { select: { id: true, username: true, snmpVersion: true } },
        organization: { select: { id: true, name: true } },
        vpnConfig: {
          select: {
            id: true,
            protocol: true,
            interfaceName: true,
            subnet: true,
            endpoint: true,
            publicKey: true,
            status: true,
          },
        },
      } as any,
    } as any)) as any;
    if (!router) throw new NotFoundException(`Router ${id} not found`);
    return router;
  }

  async update(id: string, dto: UpdateRouterDto) {
    await this.findOne(id);
    // Extract vpnConfigId explicitly so it can be set to null (disconnect)
    const { vpnConfigId, ...rest } = dto;
    return (await this.prisma.router.update({
      where: { id },
      data: {
        ...rest,
        ...(vpnConfigId !== undefined
          ? {
              vpnConfig: vpnConfigId
                ? { connect: { id: vpnConfigId } }
                : { disconnect: true },
            }
          : {}),
      } as any,
      include: {
        vpnConfig: {
          select: {
            id: true,
            protocol: true,
            interfaceName: true,
            status: true,
          },
        },
      } as any,
    } as any)) as any;
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
    const router = (await this.prisma.router.findUnique({
      where: { id },
      include: {
        credential: true,
        vpnConfig: {
          select: {
            id: true,
            protocol: true,
            interfaceName: true,
            endpoint: true,
            status: true,
          },
        },
      } as any,
    } as any)) as any;
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

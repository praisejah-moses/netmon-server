import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../services/prisma/prisma.service";
import { CryptoService } from "../../services/crypto/crypto.service";
import { VpnConfigGeneratorService } from "./vpn-config-generator.service";
import { CreateVpnConfigDto, UpdateVpnConfigDto } from "./dto/vpn.dto";
import { VpnStatus } from "../../../generated/prisma/client.js";

@Injectable()
export class VpnService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private configGenerator: VpnConfigGeneratorService,
  ) {}

  async create(organizationId: string, dto: CreateVpnConfigDto) {
    // Generate config if not provided
    const generatedConfig =
      dto.configData ||
      this.configGenerator.generateConfig(dto.protocol, {
        interfaceName: dto.interfaceName,
        subnet: dto.subnet,
        endpoint: dto.endpoint ?? undefined,
        publicKey: dto.publicKey ?? undefined,
      });

    return this.prisma.vpnConfig.create({
      data: {
        organizationId,
        protocol: dto.protocol,
        interfaceName: dto.interfaceName,
        subnet: dto.subnet,
        endpoint: dto.endpoint,
        publicKey: dto.publicKey,
        configData: this.crypto.encrypt(generatedConfig),
        status: VpnStatus.DISCONNECTED,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.vpnConfig.findMany({
      where: { organizationId },
      select: {
        id: true,
        protocol: true,
        interfaceName: true,
        subnet: true,
        endpoint: true,
        publicKey: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const config = await this.prisma.vpnConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException(`VPN config ${id} not found`);
    return config;
  }

  async update(id: string, dto: UpdateVpnConfigDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.configData) {
      data.configData = this.crypto.encrypt(dto.configData);
    }
    return this.prisma.vpnConfig.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vpnConfig.delete({ where: { id } });
  }

  async updateStatus(id: string, status: VpnStatus) {
    return this.prisma.vpnConfig.update({ where: { id }, data: { status } });
  }

  async getConfigFile(id: string): Promise<string> {
    const config = await this.findOne(id);
    if (!config.configData) {
      // Generate a fresh config
      return this.configGenerator.generateConfig(config.protocol, {
        interfaceName: config.interfaceName,
        subnet: config.subnet,
        endpoint: config.endpoint ?? undefined,
        publicKey: config.publicKey ?? undefined,
      });
    }
    return this.crypto.decrypt(config.configData);
  }
}

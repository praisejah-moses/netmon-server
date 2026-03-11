import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../services/prisma/prisma.service";
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from "./dto/organization.dto";

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({ data: dto });
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.organization.findMany({
        skip,
        take: limit,
        include: { _count: { select: { routers: true, users: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.organization.count(),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        routers: true,
        vpnConfigs: true,
        _count: { select: { routers: true, users: true } },
      },
    });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    await this.findOne(id);
    return this.prisma.organization.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.organization.delete({ where: { id } });
  }
}

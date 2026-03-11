import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../services/prisma/prisma.service";
import { CreateAlertRuleDto, UpdateAlertRuleDto } from "./dto/alert.dto";

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateAlertRuleDto) {
    return this.prisma.alertRule.create({
      data: { organizationId, ...dto },
    });
  }

  async findAll(organizationId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { organizationId };

    const [data, total] = await Promise.all([
      this.prisma.alertRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { alertInstances: true } } },
      }),
      this.prisma.alertRule.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const rule = await this.prisma.alertRule.findUnique({
      where: { id },
      include: {
        alertInstances: { take: 10, orderBy: { triggeredAt: "desc" } },
      },
    });
    if (!rule) throw new NotFoundException(`Alert rule ${id} not found`);
    return rule;
  }

  async update(id: string, dto: UpdateAlertRuleDto) {
    await this.findOne(id);
    return this.prisma.alertRule.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.alertRule.delete({ where: { id } });
  }

  async getActiveAlerts(organizationId: string) {
    return this.prisma.alertInstance.findMany({
      where: {
        status: "ACTIVE",
        alertRule: { organizationId },
      },
      include: { alertRule: true },
      orderBy: { triggeredAt: "desc" },
    });
  }
}

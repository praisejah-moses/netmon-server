import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../../services/prisma/prisma.service";
import { QUEUE_NAMES, RouterPollJob } from "./constants/queue.constants";
import { RouterProtocol } from "../../../generated/prisma/client.js";

@Injectable()
export class PollingSchedulerService {
  private readonly logger = new Logger(PollingSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ROUTER_POLL) private routerPollQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SNMP_POLL) private snmpPollQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SSH_POLL) private sshPollQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NETCONF_POLL) private netconfPollQueue: Queue,
    private prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async schedulePolling() {
    const routers = (await this.prisma.router.findMany({
      where: { status: { not: "UNREACHABLE" } },
      select: {
        id: true,
        organizationId: true,
        protocol: true,
        vendor: true,
        osType: true,
        ipAddress: true,
        apiPort: true,
        sshPort: true,
        netconfPort: true,
        vpnInterface: true,
        pollingInterval: true,
        lastPolledAt: true,
        vpnConfig: { select: { interfaceName: true } },
      } as any,
    } as any)) as any;

    for (const router of routers) {
      // Check if the router is due for polling
      if (router.lastPolledAt) {
        const elapsed = Date.now() - router.lastPolledAt.getTime();
        if (elapsed < router.pollingInterval * 1000) continue;
      }

      const jobData: RouterPollJob = {
        routerId: router.id,
        organizationId: router.organizationId,
        protocol: router.protocol,
        vendor: router.vendor,
        osType: router.osType ?? undefined,
        ipAddress: router.ipAddress,
        apiPort: router.apiPort,
        sshPort: router.sshPort,
        netconfPort: router.netconfPort,
        // Resolve VPN interface: prefer linked VpnConfig, fall back to direct override
        vpnInterface:
          router.vpnConfig?.interfaceName ?? router.vpnInterface ?? undefined,
      };

      const queue = this.resolveQueue(router.protocol);

      await queue.add(`poll-${router.id}`, jobData, {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      });
    }

    this.logger.debug(`Scheduled polling for ${routers.length} routers`);
  }

  private resolveQueue(protocol: RouterProtocol): Queue {
    switch (protocol) {
      case RouterProtocol.SNMP:
        return this.snmpPollQueue;
      case RouterProtocol.SSH_CLI:
        return this.sshPollQueue;
      case RouterProtocol.NETCONF:
        return this.netconfPollQueue;
      default:
        return this.routerPollQueue;
    }
  }
}

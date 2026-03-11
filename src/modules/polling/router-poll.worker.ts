import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import {
  QUEUE_NAMES,
  RouterPollJob,
  NormalizedMetric,
} from "./constants/queue.constants";
import { PollerRegistryService } from "./pollers/poller-registry.service";
import { MetricsIngestionService } from "../metrics/metrics-ingestion.service";
import { RoutersService } from "../routers/routers.service";
import { PrismaService } from "../../services/prisma/prisma.service";
import { RouterStatus } from "@prisma/client";

@Processor(QUEUE_NAMES.ROUTER_POLL, { concurrency: 50 })
export class RouterPollWorker extends WorkerHost {
  private readonly logger = new Logger(RouterPollWorker.name);

  constructor(
    private pollerRegistry: PollerRegistryService,
    private metricsIngestion: MetricsIngestionService,
    private routersService: RoutersService,
    private prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<RouterPollJob>): Promise<void> {
    const { routerId, organizationId, protocol, vendor, ipAddress } = job.data;
    const start = Date.now();

    try {
      const poller = this.pollerRegistry.resolve(protocol, vendor);
      if (!poller) {
        this.logger.warn(
          `No poller for protocol=${protocol}, vendor=${vendor} (router ${routerId})`,
        );
        return;
      }

      const metrics: NormalizedMetric[] = await poller.poll(job.data);

      if (metrics.length > 0) {
        await this.metricsIngestion.ingest(metrics);
      }

      await this.routersService.updateStatus(routerId, RouterStatus.HEALTHY);
      await this.logPoll(routerId, true, Date.now() - start);
    } catch (error) {
      this.logger.error(
        `Polling failed for router ${routerId} (${ipAddress}): ${error.message}`,
      );
      await this.routersService.updateStatus(routerId, RouterStatus.UNHEALTHY);
      await this.logPoll(routerId, false, Date.now() - start, error.message);
      throw error; // Let BullMQ handle retries
    }
  }

  private async logPoll(
    routerId: string,
    success: boolean,
    duration: number,
    error?: string,
  ) {
    await this.prisma.pollingLog.create({
      data: { routerId, success, duration, error },
    });
  }
}

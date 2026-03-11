import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../services/prisma/prisma.service";
import { WebhookService } from "../../services/webhook/webhook.service";
import { MetricsQueryService } from "../metrics/metrics-query.service";
import { AlertStatus } from "@prisma/client";

@Injectable()
export class AlertEvaluationService {
  private readonly logger = new Logger(AlertEvaluationService.name);

  constructor(
    private prisma: PrismaService,
    private metricsQuery: MetricsQueryService,
    private webhook: WebhookService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async evaluateAlerts() {
    const rules = await this.prisma.alertRule.findMany({
      where: { enabled: true },
      include: { organization: { select: { name: true } } },
    });

    for (const rule of rules) {
      try {
        await this.evaluateRule(rule);
      } catch (error) {
        this.logger.error(
          `Error evaluating alert rule ${rule.id}: ${error.message}`,
        );
      }
    }
  }

  private async evaluateRule(rule: any) {
    // Get routers for this organization
    const routers = await this.prisma.router.findMany({
      where: { organizationId: rule.organizationId },
      select: { id: true, routerName: true },
    });

    for (const router of routers) {
      const metrics = await this.metricsQuery.queryRouterMetrics(
        router.id,
        rule.metric,
        undefined,
        rule.duration,
      );

      if (metrics.length === 0) continue;

      // Calculate average value over the duration
      const avgValue =
        metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;

      const isViolated = this.compareValues(
        avgValue,
        rule.comparison,
        rule.threshold,
      );

      if (isViolated) {
        // Check if there's already an active alert for this rule + router
        const existing = await this.prisma.alertInstance.findFirst({
          where: {
            alertRuleId: rule.id,
            routerId: router.id,
            status: AlertStatus.ACTIVE,
          },
        });

        if (!existing) {
          const message = `Alert: ${rule.name} - ${rule.metric} ${rule.comparison} ${rule.threshold} (current: ${avgValue.toFixed(2)}) on router ${router.routerName}`;

          const alert = await this.prisma.alertInstance.create({
            data: {
              alertRuleId: rule.id,
              routerId: router.id,
              value: avgValue,
              message,
              status: AlertStatus.ACTIVE,
            },
          });

          // Send webhook notification
          if (rule.webhookUrl) {
            await this.webhook.send(rule.webhookUrl, {
              event: "alert.triggered",
              timestamp: new Date().toISOString(),
              data: {
                alertId: alert.id,
                ruleName: rule.name,
                metric: rule.metric,
                threshold: rule.threshold,
                currentValue: avgValue,
                routerName: router.routerName,
                organizationName: rule.organization.name,
                severity: rule.severity,
                message,
              },
            });
          }

          this.logger.warn(message);
        }
      } else {
        // Resolve any active alerts for this rule + router
        await this.prisma.alertInstance.updateMany({
          where: {
            alertRuleId: rule.id,
            routerId: router.id,
            status: AlertStatus.ACTIVE,
          },
          data: {
            status: AlertStatus.RESOLVED,
            resolvedAt: new Date(),
          },
        });
      }
    }
  }

  private compareValues(
    value: number,
    comparison: string,
    threshold: number,
  ): boolean {
    switch (comparison) {
      case ">":
        return value > threshold;
      case "<":
        return value < threshold;
      case ">=":
        return value >= threshold;
      case "<=":
        return value <= threshold;
      case "==":
        return value === threshold;
      default:
        return false;
    }
  }
}

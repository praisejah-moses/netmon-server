import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bullmq";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./services/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { RoutersModule } from "./modules/routers/routers.module";
import { MetricsModule } from "./modules/metrics/metrics.module";
import { PollingModule } from "./modules/polling/polling.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { VpnModule } from "./modules/vpn/vpn.module";
import { InfluxModule } from "./services/influx/influx.module";
import { CryptoModule } from "./services/crypto/crypto.module";
import { WebhookModule } from "./services/webhook/webhook.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
      },
    }),
    PrismaModule,
    InfluxModule,
    CryptoModule,
    WebhookModule,
    AuthModule,
    OrganizationsModule,
    RoutersModule,
    MetricsModule,
    PollingModule,
    AlertsModule,
    VpnModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

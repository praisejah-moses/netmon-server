import { Module } from "@nestjs/common";
import { VpnService } from "./vpn.service";
import { VpnController } from "./vpn.controller";
import { VpnConfigGeneratorService } from "./vpn-config-generator.service";

@Module({
  controllers: [VpnController],
  providers: [VpnService, VpnConfigGeneratorService],
  exports: [VpnService],
})
export class VpnModule {}

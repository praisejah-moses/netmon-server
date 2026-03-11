import { Module } from "@nestjs/common";
import { RoutersService } from "./routers.service";
import { RoutersController } from "./routers.controller";

@Module({
  controllers: [RoutersController],
  providers: [RoutersService],
  exports: [RoutersService],
})
export class RoutersModule {}

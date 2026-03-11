import { IsOptional, IsString, IsIn } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class QueryMetricsDto {
  @ApiProperty({ example: "rx_bps", required: false })
  @IsString()
  @IsOptional()
  metric?: string;

  @ApiProperty({ example: "ether1", required: false })
  @IsString()
  @IsOptional()
  interface?: string;

  @ApiProperty({
    example: "1h",
    required: false,
    description: "Time range: 5m, 15m, 1h, 6h, 12h, 1d, 7d, 30d",
  })
  @IsString()
  @IsOptional()
  @IsIn(["5m", "15m", "1h", "6h", "12h", "1d", "7d", "30d"])
  range?: string;
}

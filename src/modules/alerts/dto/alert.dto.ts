import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsUrl,
  IsIn,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { AlertSeverity } from "../../../../generated/prisma/client.js";

export class CreateAlertRuleDto {
  @ApiProperty({ example: "High CPU Alert" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: "cpu_usage" })
  @IsString()
  @IsNotEmpty()
  metric: string;

  @ApiProperty({ example: 85 })
  @IsNumber()
  threshold: number;

  @ApiProperty({ example: ">", enum: [">", "<", ">=", "<=", "=="] })
  @IsString()
  @IsIn([">", "<", ">=", "<=", "=="])
  comparison: string;

  @ApiProperty({ example: "1m" })
  @IsString()
  @IsNotEmpty()
  duration: string;

  @ApiProperty({ enum: AlertSeverity, example: AlertSeverity.WARNING })
  @IsEnum(AlertSeverity)
  @IsOptional()
  severity?: AlertSeverity;

  @ApiProperty({ required: false, example: "https://hooks.example.com/alert" })
  @IsUrl()
  @IsOptional()
  webhookUrl?: string;
}

export class UpdateAlertRuleDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  threshold?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsIn([">", "<", ">=", "<=", "=="])
  @IsOptional()
  comparison?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({ required: false })
  @IsUrl()
  @IsOptional()
  webhookUrl?: string;
}

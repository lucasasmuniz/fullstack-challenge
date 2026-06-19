import { Controller, Get } from "@nestjs/common";
import { Public } from "@crash-game/nestjs-kit";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";

@Controller()
export class WalletsController {
  @Public()
  @Get("health")
  check(): HealthCheckResponseDto {
    return new HealthCheckResponseDto("ok", "wallets");
  }
}

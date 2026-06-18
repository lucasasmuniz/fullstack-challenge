export class HealthCheckResponseDto {
  constructor(
    public readonly status: string,
    public readonly service: string,
  ) {}
}

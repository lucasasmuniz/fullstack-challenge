import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { metrics, type Meter } from "@opentelemetry/api";

/**
 * Bootstrap mínimo de métricas OpenTelemetry: sobe o `PrometheusExporter` (serve `/metrics`) e um
 * `MeterProvider` global; cada serviço cria seus instrumentos a partir do `meter`. A app exporta só
 * contadores monótonos + histogramas; razões (RTP) são derivadas em PromQL no Grafana (média de
 * médias entre instâncias estaria errada).
 */
export interface MetricsHandle {
  readonly meter: Meter;
  shutdown(): Promise<void>;
}

export function startMetrics(serviceName: string, port: number): MetricsHandle {
  const exporter = new PrometheusExporter({ port, host: "0.0.0.0" });
  const provider = new MeterProvider({ readers: [exporter] });
  metrics.setGlobalMeterProvider(provider);
  return {
    meter: metrics.getMeter(serviceName),
    shutdown: () => provider.shutdown(),
  };
}

export { metrics } from "@opentelemetry/api";
export type { Meter, Counter, Histogram, Attributes } from "@opentelemetry/api";

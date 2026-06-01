// instrumentation.node.ts
// Configures the OpenTelemetry SDK to export traces to Jaeger via OTLP/HTTP.
// This file is only imported in the Node.js runtime (see instrumentation.ts).
//
// To run Jaeger locally:
//   docker run --rm --name jaeger \
//     -p 16686:16686 -p 4317:4317 -p 4318:4318 \
//     cr.jaegertracing.io/jaegertracing/jaeger:2.18.0
//
// Then open http://localhost:16686 to view traces.

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "ai-agent-masterclass",
  }),
  spanProcessor: new SimpleSpanProcessor(
    new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),
  ),
});

sdk.start();

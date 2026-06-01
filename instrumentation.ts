// instrumentation.ts
// Next.js automatically loads this file before any route handlers run.
// We guard with NEXT_RUNTIME because @opentelemetry/sdk-node uses Node.js-specific
// APIs that would crash in the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}

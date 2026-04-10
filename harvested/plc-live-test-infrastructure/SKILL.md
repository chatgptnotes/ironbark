---
name: PLC Live Integration Test Infrastructure
description: Software PLC simulators + test harness for validating SCADA protocol adapters with real TCP traffic instead of mocks
source_project: nexaproc
projects_used_in: [nexaproc]
tags: [typescript, scada, modbus, mqtt, opcua, testing, integration, plc]
---

# PLC Live Integration Test Infrastructure

## Problem

SCADA platforms have protocol adapters (Modbus, MQTT, OPC UA) that automatically fall back to simulation mode when hardware is unavailable. This means all tests pass even when the adapter code is broken — simulation masks real bugs. You need tests that verify real protocol traffic over real TCP connections.

## Architecture

```
simulators/              tests/
  modbus-server.ts  ←──── modbus-connect.test.ts
  mqtt-publisher.ts ←──── mqtt-connect.test.ts
  opcua-test-server.ts ── opcua-connect.test.ts
                          full-datapath.test.ts (adapter → tag engine → historian)
```

## Key Pattern: disableSimulation Flag

Add `disableSimulation?: boolean` to the adapter config interface. When true, the adapter **throws** instead of entering simulation mode:

```typescript
private enterSimulation(): void {
  if (this.config.disableSimulation) {
    this.setStatus('ERROR');
    throw new Error(`Connection failed and simulation is disabled`);
  }
  // normal simulation fallback...
}
```

Tests set `disableSimulation: true` so they **fail loudly** if the real connection doesn't work.

## Software Simulators

| Protocol | Tool | Port | Values |
|----------|------|------|--------|
| Modbus TCP | `modbus-serial` ServerTCP | 5020 (not 502, no admin needed) | register N = N * 10, coil even=ON |
| MQTT | Mosquitto (Docker) + publisher script | 1883 | 8 topics, 500ms publish interval |
| OPC UA | `node-opcua` OPCUAServer | 4841 (not 4840, avoids conflict) | 10 Float + 5 Boolean, writable |

## Vitest Config for Live Tests

Separate config — no mocks, longer timeouts, sequential execution:

```typescript
// vitest.config.live.ts
export default defineConfig({
  test: {
    include: ['src/tests/integration-live/suites/**/*.test.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },  // sequential — simulators share ports
  },
});
```

## Critical Gotcha: ALLOWED_DEVICE_SUBNETS

If your SCADA platform has SSRF protection that blocks device connections by subnet, the default likely excludes `127.0.0.0/8` (loopback). You MUST add it for localhost simulator testing:

```
ALLOWED_DEVICE_SUBNETS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8
```

## When This Applies

- SCADA/industrial control systems with protocol adapters
- IoT platforms with device connectivity
- Any system with simulation fallback that masks real connection bugs

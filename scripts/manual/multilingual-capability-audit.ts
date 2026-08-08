import { runMultilingualCapabilityAudit } from "../lib/multilingual-capability-audit";

const report = await runMultilingualCapabilityAudit();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "pass") process.exitCode = 1;

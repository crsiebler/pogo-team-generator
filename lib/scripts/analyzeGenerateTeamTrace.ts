import { runFunctionTraceAnalyzerCli } from '@/lib/build/functionTraceAnalyzer';

const exitCode = await runFunctionTraceAnalyzerCli({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  stdout: (message: string) => process.stdout.write(message),
  stderr: (message: string) => process.stderr.write(message),
});

process.exitCode = exitCode;

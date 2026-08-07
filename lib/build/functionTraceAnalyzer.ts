import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  loadRuntimeFunctionAssetPlan,
  validateRuntimeFunctionTraceAssets,
  type RuntimeFunctionAssetPlan,
} from '@/lib/build/runtimeFunctionAssets';

const DEFAULT_TRACE_PATH =
  '.next/server/app/api/generate-team/route.js.nft.json';
const DEFAULT_POKEMON_LIST_TRACE_PATH =
  '.next/server/app/api/pokemon-list/route.js.nft.json';
const DEFAULT_LARGEST_FILE_LIMIT = 20;
const TRACE_VERSION = 1;

const TRACE_CATEGORIES = [
  'simulations',
  'rankings',
  'applicationCode',
  'dependencies',
  'otherData',
] as const;

/** Category used to group uncompressed files in a function trace report. */
export type FunctionTraceCategory = (typeof TRACE_CATEGORIES)[number];

/** Aggregate file count and uncompressed bytes for one trace category. */
export interface FunctionTraceCategoryReport {
  category: FunctionTraceCategory;
  files: number;
  uncompressedBytes: number;
}

/** One of the largest files referenced by a function trace. */
export interface FunctionTraceFileReport {
  path: string;
  category: FunctionTraceCategory;
  uncompressedBytes: number;
}

/** Deterministic summary of a generated Next.js function trace. */
export interface FunctionTraceReport {
  trace: string;
  uniqueTracedFiles: number;
  uncompressedBytes: number;
  categories: FunctionTraceCategoryReport[];
  largestFiles: FunctionTraceFileReport[];
}

/** Options for analyzing a generated Next.js function trace. */
export interface AnalyzeFunctionTraceOptions {
  tracePath: string;
  projectRoot?: string;
  largestFileLimit?: number;
}

/** Injectable terminal boundaries for the non-interactive analyzer CLI. */
export interface FunctionTraceAnalyzerCliOptions {
  args: readonly string[];
  cwd: string;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  validateRuntimeAssets?: boolean;
  runtimeAssetPlan?: RuntimeFunctionAssetPlan;
}

/** Exact resolved files and metadata referenced by one Next.js function trace. */
export interface FunctionTraceInventory {
  trace: string;
  files: FunctionTraceFileReport[];
}

interface NextTrace {
  version: number;
  files: string[];
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function toDisplayPath(projectRoot: string, filePath: string): string {
  const relativePath = path.relative(projectRoot, filePath) || '.';
  return relativePath.split(path.sep).join('/');
}

function isWithinDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, filePath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
}

function categorizeFile(
  projectRoot: string,
  filePath: string,
): FunctionTraceCategory {
  const dataRoot = path.join(projectRoot, 'data');
  if (isWithinDirectory(filePath, path.join(dataRoot, 'simulations'))) {
    return 'simulations';
  }
  if (isWithinDirectory(filePath, path.join(dataRoot, 'rankings'))) {
    return 'rankings';
  }
  if (filePath.split(path.sep).includes('node_modules')) {
    return 'dependencies';
  }
  if (isWithinDirectory(filePath, dataRoot)) {
    return 'otherData';
  }
  return 'applicationCode';
}

function parseTrace(contents: string, traceDisplayPath: string): NextTrace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(
      `Trace ${traceDisplayPath} must contain valid JSON from a completed Next.js build.`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Trace ${traceDisplayPath} must contain a JSON object.`);
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== TRACE_VERSION) {
    throw new Error(
      `Trace ${traceDisplayPath} has unsupported version ${String(record.version)}; expected ${TRACE_VERSION}.`,
    );
  }
  if (!Array.isArray(record.files)) {
    throw new Error(`Trace ${traceDisplayPath} must contain a files array.`);
  }

  const files = record.files.map((entry, index) => {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      entry.includes('\0') ||
      path.isAbsolute(entry)
    ) {
      throw new Error(
        `Trace ${traceDisplayPath} files[${index}] must be a non-empty relative path.`,
      );
    }
    return entry;
  });

  return { version: TRACE_VERSION, files };
}

function getFileSystemErrorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' ? code : 'UNKNOWN';
}

async function readTraceFile(
  tracePath: string,
  traceDisplayPath: string,
): Promise<string> {
  try {
    return await readFile(tracePath, 'utf8');
  } catch (error) {
    const code = getFileSystemErrorCode(error);
    if (code === 'ENOENT') {
      throw new Error(
        `Trace ${traceDisplayPath} was not found. Run npm run build first.`,
      );
    }
    throw new Error(
      `Trace ${traceDisplayPath} could not be read (filesystem error ${code}).`,
    );
  }
}

/**
 * Analyzes exact files listed by a generated Next.js NFT trace.
 */
export async function analyzeFunctionTrace(
  options: AnalyzeFunctionTraceOptions,
): Promise<FunctionTraceReport> {
  const inventory = await inspectFunctionTrace(options);
  const largestFileLimit =
    options.largestFileLimit ?? DEFAULT_LARGEST_FILE_LIMIT;
  if (!Number.isSafeInteger(largestFileLimit) || largestFileLimit < 0) {
    throw new Error('largestFileLimit must be a non-negative safe integer.');
  }

  return createFunctionTraceReport(inventory, largestFileLimit);
}

function createFunctionTraceReport(
  inventory: FunctionTraceInventory,
  largestFileLimit: number,
): FunctionTraceReport {
  const files = inventory.files;

  const categories = TRACE_CATEGORIES.map((category) => {
    const categoryFiles = files.filter((file) => file.category === category);
    return {
      category,
      files: categoryFiles.length,
      uncompressedBytes: categoryFiles.reduce(
        (total, file) => total + file.uncompressedBytes,
        0,
      ),
    };
  });
  const uncompressedBytes = categories.reduce(
    (total, category) => total + category.uncompressedBytes,
    0,
  );
  if (!Number.isSafeInteger(uncompressedBytes)) {
    throw new Error(
      `Trace ${inventory.trace} exceeds the supported byte total.`,
    );
  }

  return {
    trace: inventory.trace,
    uniqueTracedFiles: files.length,
    uncompressedBytes,
    categories,
    largestFiles: [...files]
      .sort(
        (left, right) =>
          right.uncompressedBytes - left.uncompressedBytes ||
          compareText(left.path, right.path),
      )
      .slice(0, largestFileLimit),
  };
}

/** Inspect and resolve every exact file referenced by a Next.js NFT trace. */
export async function inspectFunctionTrace(
  options: AnalyzeFunctionTraceOptions,
): Promise<FunctionTraceInventory> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const tracePath = path.resolve(options.tracePath);
  const traceDisplayPath = toDisplayPath(projectRoot, tracePath);

  const contents = await readTraceFile(tracePath, traceDisplayPath);
  const trace = parseTrace(contents, traceDisplayPath);
  const traceDirectory = path.dirname(tracePath);
  const uniquePaths = [
    ...new Set(trace.files.map((entry) => path.resolve(traceDirectory, entry))),
  ].sort(compareText);

  const files: FunctionTraceFileReport[] = [];
  for (const resolvedPath of uniquePaths) {
    const displayPath = toDisplayPath(projectRoot, resolvedPath);
    let fileStats;
    try {
      fileStats = await stat(resolvedPath);
    } catch (error) {
      throw new Error(
        `Traced file ${displayPath} from ${traceDisplayPath} could not be read (filesystem error ${getFileSystemErrorCode(error)}).`,
      );
    }
    if (!fileStats.isFile()) {
      throw new Error(
        `Traced path ${displayPath} from ${traceDisplayPath} is not a file.`,
      );
    }
    if (!Number.isSafeInteger(fileStats.size) || fileStats.size < 0) {
      throw new Error(`Traced file ${displayPath} has an unsupported size.`);
    }
    files.push({
      path: displayPath,
      category: categorizeFile(projectRoot, resolvedPath),
      uncompressedBytes: fileStats.size,
    });
  }

  return {
    trace: traceDisplayPath,
    files,
  };
}

/** Serializes a trace report as stable machine-readable JSON. */
export function formatFunctionTraceReport(report: FunctionTraceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function parseCliTracePath(args: readonly string[], cwd: string): string {
  if (args.length === 0) {
    return path.join(cwd, DEFAULT_TRACE_PATH);
  }
  if (args.length === 2 && args[0] === '--trace' && args[1].length > 0) {
    return path.resolve(cwd, args[1]);
  }
  throw new Error(
    'Usage: npm run analyze:generate-team-trace -- [--trace <path>]',
  );
}

/** Runs the trace analyzer CLI and returns its process exit code. */
export async function runFunctionTraceAnalyzerCli(
  options: FunctionTraceAnalyzerCliOptions,
): Promise<number> {
  try {
    if (options.validateRuntimeAssets && options.args.length > 0) {
      throw new Error(
        'Runtime asset validation requires the canonical generate-team trace; omit --trace.',
      );
    }
    const tracePath = parseCliTracePath(options.args, options.cwd);
    const generateTeamInventory = await inspectFunctionTrace({
      tracePath,
      projectRoot: options.cwd,
    });
    const report = createFunctionTraceReport(
      generateTeamInventory,
      DEFAULT_LARGEST_FILE_LIMIT,
    );
    if (options.validateRuntimeAssets) {
      const pokemonListInventory = await inspectFunctionTrace({
        tracePath: path.join(options.cwd, DEFAULT_POKEMON_LIST_TRACE_PATH),
        projectRoot: options.cwd,
      });
      validateRuntimeFunctionTraceAssets({
        plan:
          options.runtimeAssetPlan ?? loadRuntimeFunctionAssetPlan(options.cwd),
        generateTeamTracedFiles: generateTeamInventory.files.map(
          (file) => file.path,
        ),
        pokemonListTracedFiles: pokemonListInventory.files.map(
          (file) => file.path,
        ),
        generateTeamUncompressedBytes: report.uncompressedBytes,
      });
    }
    options.stdout(formatFunctionTraceReport(report));
    return 0;
  } catch (error) {
    options.stderr(
      `Trace analysis failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

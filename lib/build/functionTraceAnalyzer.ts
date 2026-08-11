import { lstat, readFile, readlink, realpath, stat } from 'node:fs/promises';
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
const DEFAULT_TEAM_DETAILS_TRACE_PATH =
  '.next/server/app/api/team-details/route.js.nft.json';
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
  inspectTrace?: (
    options: AnalyzeFunctionTraceOptions,
  ) => Promise<FunctionTraceInventory>;
}

/** Exact resolved files and metadata referenced by one Next.js function trace. */
export interface FunctionTraceInventory {
  trace: string;
  files: FunctionTraceFileReport[];
  authorityPaths: string[];
}

interface NextTrace {
  version: number;
  files: string[];
}

interface TrustedDependencyRoot {
  canonicalPath: string;
  lexicalPath: string;
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

async function getTrustedDependencyRoots(
  projectRoot: string,
): Promise<TrustedDependencyRoot[]> {
  const roots = new Map<string, TrustedDependencyRoot>();
  let currentDirectory = projectRoot;

  while (true) {
    const dependencyRoot = path.join(currentDirectory, 'node_modules');
    let canonicalRoot: string | undefined;
    let isDirectory = false;
    try {
      canonicalRoot = await realpath(dependencyRoot);
      const rootStats = await stat(canonicalRoot);
      isDirectory = rootStats.isDirectory();
    } catch (error) {
      if (getFileSystemErrorCode(error) !== 'ENOENT') {
        throw new Error(
          `Trusted dependency root ${toDisplayPath(projectRoot, dependencyRoot)} could not be resolved (filesystem error ${getFileSystemErrorCode(error)}).`,
        );
      }
    }
    if (canonicalRoot !== undefined && isDirectory) {
      if (
        canonicalRoot === path.parse(canonicalRoot).root ||
        isWithinDirectory(projectRoot, canonicalRoot)
      ) {
        throw new Error(
          `Trusted dependency root ${toDisplayPath(projectRoot, dependencyRoot)} canonically contains the project and is too broad.`,
        );
      }
      const rootKey = `${canonicalRoot}\0${dependencyRoot}`;
      if (!roots.has(rootKey)) {
        roots.set(rootKey, {
          canonicalPath: canonicalRoot,
          lexicalPath: dependencyRoot,
        });
      }
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }
    currentDirectory = parentDirectory;
  }

  return Array.from(roots.values()).sort(
    (left, right) =>
      right.canonicalPath.length - left.canonicalPath.length ||
      compareText(left.lexicalPath, right.lexicalPath),
  );
}

async function assertNoSymbolicLinkInRepositoryDataPath(
  projectRoot: string,
  resolvedPath: string,
  displayPath: string,
): Promise<void> {
  const dataRoot = path.join(projectRoot, 'data');
  if (!isWithinDirectory(resolvedPath, dataRoot)) {
    return;
  }

  const relativeSegments = path
    .relative(dataRoot, resolvedPath)
    .split(path.sep);
  let currentPath = dataRoot;
  for (const segment of ['', ...relativeSegments]) {
    if (segment.length > 0) {
      currentPath = path.join(currentPath, segment);
    }
    const pathStats = await lstat(currentPath);
    if (pathStats.isSymbolicLink()) {
      throw new Error(
        `Traced repository data file ${displayPath} must not contain a symbolic link.`,
      );
    }
  }
}

async function getSymlinkDependencyAuthorityPaths(
  candidatePaths: readonly string[],
  canonicalPath: string,
  trustedDependencyRoots: readonly TrustedDependencyRoot[],
): Promise<string[]> {
  const authorityPaths = new Set<string>();
  const visitedCandidates = new Set<string>();

  function addAuthorityPath(authorityPath: string): void {
    for (const root of trustedDependencyRoots) {
      if (isWithinDirectory(authorityPath, root.lexicalPath)) {
        authorityPaths.add(authorityPath);
      }
      if (isWithinDirectory(authorityPath, root.canonicalPath)) {
        authorityPaths.add(
          path.join(
            root.lexicalPath,
            path.relative(root.canonicalPath, authorityPath),
          ),
        );
      }
    }
  }

  async function collectAuthorityPaths(candidatePath: string): Promise<void> {
    if (visitedCandidates.has(candidatePath)) {
      return;
    }
    visitedCandidates.add(candidatePath);

    const pathRoot = path.parse(candidatePath).root;
    const segments = candidatePath.slice(pathRoot.length).split(path.sep);
    const pendingSegments = [...segments];
    let currentPath = pathRoot;
    const visitedSymlinkStates = new Set<string>();

    while (pendingSegments.length > 0) {
      const segment = pendingSegments.shift();
      if (segment === undefined || segment === '' || segment === '.') {
        continue;
      }
      if (segment === '..') {
        currentPath = path.dirname(currentPath);
        continue;
      }
      currentPath = path.join(currentPath, segment);
      if (!(await lstat(currentPath)).isSymbolicLink()) {
        continue;
      }

      const stateKey = `${currentPath}\0${pendingSegments.join('\0')}`;
      if (visitedSymlinkStates.has(stateKey)) {
        throw new Error(
          `Traced dependency path ${candidatePath} contains a symbolic link cycle.`,
        );
      }
      visitedSymlinkStates.add(stateKey);

      addAuthorityPath(currentPath);
      if (!pendingSegments.includes('..')) {
        const fileAuthorityPath = path.join(currentPath, ...pendingSegments);
        if ((await realpath(fileAuthorityPath)) === canonicalPath) {
          addAuthorityPath(fileAuthorityPath);
        }
      }

      const linkTarget = await readlink(currentPath);
      const linkRoot = path.parse(linkTarget).root;
      currentPath = linkRoot || path.dirname(currentPath);
      const targetSegments = linkTarget.slice(linkRoot.length).split(path.sep);
      pendingSegments.unshift(...targetSegments);
    }
  }

  for (const candidatePath of candidatePaths) {
    if ((await realpath(candidatePath)) === canonicalPath) {
      await collectAuthorityPaths(candidatePath);
    }
  }

  return Array.from(authorityPaths).sort(compareText);
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

function getRuntimeSnapshotByteTotal(
  inventories: readonly FunctionTraceInventory[],
): number {
  const snapshots = new Map<string, number>();

  for (const file of inventories.flatMap((inventory) => inventory.files)) {
    if (!file.path.endsWith('/runtime-snapshot.json')) {
      continue;
    }
    const existingSize = snapshots.get(file.path);
    if (existingSize !== undefined && existingSize !== file.uncompressedBytes) {
      throw new Error(
        `Runtime snapshot ${file.path} has inconsistent traced sizes.`,
      );
    }
    snapshots.set(file.path, file.uncompressedBytes);
  }

  const total = Array.from(snapshots.values()).reduce(
    (sum, snapshotBytes) => sum + snapshotBytes,
    0,
  );
  if (!Number.isSafeInteger(total)) {
    throw new Error('Runtime snapshots exceed the supported byte total.');
  }
  return total;
}

/** Inspect and resolve every exact file referenced by a Next.js NFT trace. */
export async function inspectFunctionTrace(
  options: AnalyzeFunctionTraceOptions,
): Promise<FunctionTraceInventory> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const canonicalProjectRoot = await realpath(projectRoot);
  const tracePath = path.resolve(options.tracePath);
  const traceDisplayPath = toDisplayPath(projectRoot, tracePath);

  const contents = await readTraceFile(tracePath, traceDisplayPath);
  const trace = parseTrace(contents, traceDisplayPath);
  const traceDirectory = path.dirname(tracePath);
  const trustedDependencyRoots =
    await getTrustedDependencyRoots(canonicalProjectRoot);
  const tracedPaths = trace.files.map((entry) =>
    path.resolve(traceDirectory, entry),
  );
  if (path.basename(tracePath) === 'route.js.nft.json') {
    tracedPaths.push(tracePath.slice(0, -'.nft.json'.length));
  }
  const uniquePaths = [...new Set(tracedPaths)].sort(compareText);

  const files: FunctionTraceFileReport[] = [];
  const canonicalPaths = new Set<string>();
  const authorityPaths = new Set<string>();
  for (const resolvedPath of uniquePaths) {
    const displayPath = toDisplayPath(projectRoot, resolvedPath);
    try {
      await lstat(resolvedPath);
    } catch (error) {
      throw new Error(
        `Traced file ${displayPath} from ${traceDisplayPath} could not be read (filesystem error ${getFileSystemErrorCode(error)}).`,
      );
    }
    await assertNoSymbolicLinkInRepositoryDataPath(
      projectRoot,
      resolvedPath,
      displayPath,
    );

    let canonicalPath;
    try {
      canonicalPath = await realpath(resolvedPath);
    } catch (error) {
      throw new Error(
        `Traced file ${displayPath} from ${traceDisplayPath} could not be resolved (filesystem error ${getFileSystemErrorCode(error)}).`,
      );
    }
    const isCanonicalProjectPath = isWithinDirectory(
      canonicalPath,
      canonicalProjectRoot,
    );
    const canonicalDependencyRoots = trustedDependencyRoots.filter((root) =>
      isWithinDirectory(canonicalPath, root.canonicalPath),
    );
    const lexicalDependencyRoots = trustedDependencyRoots.filter((root) =>
      isWithinDirectory(resolvedPath, root.lexicalPath),
    );
    const dependencyAuthorityCandidates = new Set([resolvedPath]);
    for (const root of canonicalDependencyRoots) {
      for (const sourcePath of [resolvedPath, canonicalPath]) {
        if (isWithinDirectory(sourcePath, root.canonicalPath)) {
          dependencyAuthorityCandidates.add(
            path.join(
              root.lexicalPath,
              path.relative(root.canonicalPath, sourcePath),
            ),
          );
        }
      }
    }
    const symlinkDependencyAuthorityPaths =
      await getSymlinkDependencyAuthorityPaths(
        Array.from(dependencyAuthorityCandidates),
        canonicalPath,
        trustedDependencyRoots,
      );
    if (!isCanonicalProjectPath && canonicalDependencyRoots.length === 0) {
      throw new Error(
        `Traced file ${displayPath} resolves outside the project and trusted dependencies.`,
      );
    }
    if (
      !isCanonicalProjectPath &&
      isWithinDirectory(resolvedPath, projectRoot) &&
      lexicalDependencyRoots.length === 0
    ) {
      throw new Error(
        `Traced file ${displayPath} resolves through a project symlink that erases package dependency authority.`,
      );
    }
    const dependencyRoot =
      canonicalDependencyRoots.find((root) =>
        isWithinDirectory(resolvedPath, root.lexicalPath),
      ) ?? canonicalDependencyRoots[0];
    const dependencyDisplayPath =
      dependencyRoot === undefined
        ? undefined
        : isWithinDirectory(resolvedPath, dependencyRoot.lexicalPath)
          ? resolvedPath
          : path.join(
              dependencyRoot.lexicalPath,
              path.relative(dependencyRoot.canonicalPath, canonicalPath),
            );
    const canonicalDisplayPath = toDisplayPath(
      canonicalProjectRoot,
      dependencyDisplayPath ?? canonicalPath,
    );
    authorityPaths.add(toDisplayPath(canonicalProjectRoot, canonicalPath));
    authorityPaths.add(toDisplayPath(projectRoot, resolvedPath));
    for (const authorityPath of symlinkDependencyAuthorityPaths) {
      authorityPaths.add(toDisplayPath(canonicalProjectRoot, authorityPath));
    }
    for (const root of canonicalDependencyRoots) {
      authorityPaths.add(
        toDisplayPath(
          canonicalProjectRoot,
          isWithinDirectory(resolvedPath, root.lexicalPath)
            ? resolvedPath
            : path.join(
                root.lexicalPath,
                path.relative(root.canonicalPath, canonicalPath),
              ),
        ),
      );
    }
    if (canonicalPaths.has(canonicalPath)) {
      continue;
    }
    canonicalPaths.add(canonicalPath);

    let fileStats;
    try {
      fileStats = await stat(canonicalPath);
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
      path: canonicalDisplayPath,
      category:
        dependencyRoot === undefined
          ? categorizeFile(canonicalProjectRoot, canonicalPath)
          : 'dependencies',
      uncompressedBytes: fileStats.size,
    });
  }

  return {
    trace: traceDisplayPath,
    files,
    authorityPaths: Array.from(authorityPaths).sort(compareText),
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
    const inspectTrace = options.inspectTrace ?? inspectFunctionTrace;
    const generateTeamInventory = await inspectTrace({
      tracePath,
      projectRoot: options.cwd,
    });
    const report = createFunctionTraceReport(
      generateTeamInventory,
      DEFAULT_LARGEST_FILE_LIMIT,
    );
    if (options.validateRuntimeAssets) {
      const teamDetailsInventory = await inspectTrace({
        tracePath: path.join(options.cwd, DEFAULT_TEAM_DETAILS_TRACE_PATH),
        projectRoot: options.cwd,
      });
      const pokemonListInventory = await inspectTrace({
        tracePath: path.join(options.cwd, DEFAULT_POKEMON_LIST_TRACE_PATH),
        projectRoot: options.cwd,
      });
      const teamDetailsReport = createFunctionTraceReport(
        teamDetailsInventory,
        DEFAULT_LARGEST_FILE_LIMIT,
      );
      validateRuntimeFunctionTraceAssets({
        plan: options.runtimeAssetPlan ?? loadRuntimeFunctionAssetPlan(),
        generateTeamTracedFiles: generateTeamInventory.authorityPaths,
        teamDetailsTracedFiles: teamDetailsInventory.authorityPaths,
        pokemonListTracedFiles: pokemonListInventory.authorityPaths,
        generateTeamUncompressedBytes: report.uncompressedBytes,
        teamDetailsUncompressedBytes: teamDetailsReport.uncompressedBytes,
        runtimeSnapshotUncompressedBytes: getRuntimeSnapshotByteTotal([
          generateTeamInventory,
          teamDetailsInventory,
        ]),
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

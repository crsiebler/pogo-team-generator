import fs from 'node:fs';
import path from 'node:path';

export interface PvpokeRuntimeBoundaryViolation {
  path: string;
  line: number;
  reason: string;
}

export interface PvpokeRuntimeBoundaryOptions {
  projectRoot: string;
  runtimeRoots: string[];
  excludedRuntimeSubtrees?: string[];
  virtualFiles?: Map<string, string>;
}

const sourceFileExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.ts',
  '.tsx',
]);

const excludedFilePatterns = [
  '.test.',
  '.spec.',
  '.d.ts',
  `${path.sep}__tests__${path.sep}`,
];

const runtimeModuleSpecifierPattern =
  /\b(?:import|export)\s+(?!type\b)(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g;

const pvpokeVendorRuntimeLoadPattern =
  /\b(?:import|require|require\.resolve|readFileSync|readFile|createReadStream|new\s+URL)\s*\(([\s\S]{0,5000}?)\)/g;

const genericCallPattern = /\b([A-Za-z_$][\w$]*)\s*\(([\s\S]{0,5000}?)\)/g;

const bracketCallPattern =
  /\b([A-Za-z_$][\w$]*)\s*(?:\?\.)?\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\]\s*(?:\?\.)?\s*\(([\s\S]{0,5000}?)\)/g;

const chainedCreateRequireCallPattern =
  /\b([A-Za-z_$][\w$]*)\s*\([\s\S]{0,5000}?\)\s*\(([\s\S]{0,5000}?)\)/g;

const inlineCreateRequireResolveCallPattern =
  /\b([A-Za-z_$][\w$]*)\s*\([\s\S]{0,5000}?\)\s*\.\s*resolve\s*\(([\s\S]{0,5000}?)\)/g;

const indirectCreateRequireCallPattern =
  /\(\s*0\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s*\([\s\S]{0,5000}?\)\s*(?:\.\s*resolve\s*)?\(([\s\S]{0,5000}?)\)/g;

const memberResolveCallPattern =
  /\b([A-Za-z_$][\w$]*)\s*\.\s*resolve\s*\(([\s\S]{0,5000}?)\)/g;

const memberResolveVariantPattern =
  /\b([A-Za-z_$][\w$]*)\s*\.\s*resolve\s*(?:\?\.\s*\(([\s\S]{0,5000}?)\)|\.\s*(?:call|apply)\s*\(([\s\S]{0,5000}?)\))/g;

const loaderCallVariantPattern =
  /\b([A-Za-z_$][\w$]*)\s*(?:\?\.\s*\(([\s\S]{0,5000}?)\)|\.\s*(?:call|apply)\s*\(([\s\S]{0,5000}?)\))/g;

const nonLoaderCallNames = new Set([
  'createRequire',
  'dirname',
  'join',
  'pathToFileURL',
]);

const assignedValuePattern =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]{0,5000}?);|\b([A-Za-z_$][\w$]*)\s*=\s*([\s\S]{0,5000}?);|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]{0,500})(?:\n|$)|\b([A-Za-z_$][\w$]*)\s*=\s*([^;\n]{0,500})(?:\n|$)/g;

function toRelativePath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

function normalizeRelativePath(filePath: string): string {
  return filePath
    .replace(
      /\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,
      (_, codePoint, unicode, hex) =>
        String.fromCodePoint(parseInt(codePoint ?? unicode ?? hex, 16)),
    )
    .replace(/[\\/]+/g, '/')
    .split(path.sep)
    .join('/');
}

function isSourceFile(filePath: string): boolean {
  return sourceFileExtensions.has(path.extname(filePath));
}

function isExcludedFile(relativePath: string): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);

  return excludedFilePatterns.some((pattern) =>
    normalizedPath.includes(pattern),
  );
}

function isInExcludedSubtree(
  relativePath: string,
  excludedRuntimeSubtrees: string[],
): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);

  return excludedRuntimeSubtrees.some((excludedSubtree) => {
    const normalizedSubtree = normalizeRelativePath(excludedSubtree).replace(
      /\/$/,
      '',
    );

    return (
      normalizedPath === normalizedSubtree ||
      normalizedPath.startsWith(`${normalizedSubtree}/`)
    );
  });
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function escapeRegExp(content: string): string {
  return content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createIdentifierReferencePattern(identifier: string): RegExp {
  return new RegExp(
    `(?<![A-Za-z0-9_$])${escapeRegExp(identifier)}(?![A-Za-z0-9_$])`,
  );
}

function containsDirectPvpokeVendorPath(content: string): boolean {
  const normalizedContent = normalizeRelativePath(content);

  return /(?:vendor\/pvpoke|pvpoke\/src|^pvpoke(?:\/|$))/.test(
    normalizedContent.trim(),
  );
}

function getPathSegmentsFromStringLiterals(content: string): string[] {
  const normalizedContent = content.replace(
    /\$\{\s*(['"])([^'"]+)\1\s*\}/g,
    '$2',
  );

  return Array.from(normalizedContent.matchAll(/['"`]([^'"`]+)['"`]/g))
    .flatMap((match) =>
      normalizeRelativePath(match[1] ?? '')
        .toLowerCase()
        .split(/[^a-z0-9_$]+/),
    )
    .filter(Boolean);
}

function containsPathSegmentSequence(
  content: string,
  sequence: string[],
): boolean {
  const pathSegments = getPathSegmentsFromStringLiterals(content);

  return pathSegments.some((_, index) =>
    sequence.every(
      (segment, sequenceIndex) =>
        pathSegments[index + sequenceIndex] === segment,
    ),
  );
}

function containsConstructedExcludedRuntimeSubtree(
  content: string,
  excludedRuntimeSubtrees: string[],
): boolean {
  return excludedRuntimeSubtrees.some((excludedRuntimeSubtree) => {
    const subtreeParts = normalizeRelativePath(excludedRuntimeSubtree)
      .toLowerCase()
      .split('/')
      .filter(Boolean);

    return containsPathSegmentSequence(content, subtreeParts);
  });
}

function containsConstructedPvpokeVendorJsPath(content: string): boolean {
  const compactContent = content
    .toLowerCase()
    .replace(/['"`]\s*\+\s*['"`]/g, '');
  const compactSegments = getPathSegmentsFromStringLiterals(compactContent);
  const hasSegment = (segment: string): boolean =>
    compactSegments.includes(segment);

  return (
    containsPathSegmentSequence(content, ['vendor', 'pvpoke', 'src', 'js']) ||
    containsPathSegmentSequence(content, ['pvpoke', 'src', 'js']) ||
    (hasSegment('pvpoke') && hasSegment('src') && hasSegment('js'))
  );
}

function maskComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g, (comment) =>
    comment.replace(/[^\n\r]/g, ' '),
  );
}

function isInsideCommentOrString(content: string, index: number): boolean {
  let quote: string | undefined;
  let isLineComment = false;
  let isBlockComment = false;
  let isEscaped = false;
  let templateExpressionDepth = 0;

  for (let position = 0; position < index; position += 1) {
    const current = content[position];
    const next = content[position + 1];

    if (isLineComment) {
      if (current === '\n' || current === '\r') {
        isLineComment = false;
      }

      continue;
    }

    if (isBlockComment) {
      if (current === '*' && next === '/') {
        isBlockComment = false;
        position += 1;
      }

      continue;
    }

    if (quote !== undefined) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (current === '\\') {
        isEscaped = true;
        continue;
      }

      if (quote === '`' && current === '$' && next === '{') {
        quote = undefined;
        templateExpressionDepth = 1;
        position += 1;
        continue;
      }

      if (current === quote) {
        quote = undefined;
      }

      continue;
    }

    if (templateExpressionDepth > 0) {
      if (current === '{') {
        templateExpressionDepth += 1;
        continue;
      }

      if (current === '}') {
        templateExpressionDepth -= 1;

        if (templateExpressionDepth === 0) {
          quote = '`';
        }

        continue;
      }
    }

    if (current === '/' && next === '/') {
      isLineComment = true;
      position += 1;
      continue;
    }

    if (current === '/' && next === '*') {
      isBlockComment = true;
      position += 1;
      continue;
    }

    if (current === "'" || current === '"' || current === '`') {
      quote = current;
    }
  }

  return quote !== undefined || isLineComment || isBlockComment;
}

function isTypeOnlyDynamicImport(content: string, index: number): boolean {
  return /\btypeof\s*$/.test(content.slice(Math.max(0, index - 20), index));
}

function isTypeOnlyNamedModuleSpecifier(statement: string): boolean {
  const namedSpecifiers = statement.match(/\{([^}]+)\}/)?.[1];

  if (namedSpecifiers === undefined) {
    return false;
  }

  return namedSpecifiers
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean)
    .every((specifier) => specifier.startsWith('type '));
}

function resolveRuntimeSpecifier(
  relativePath: string,
  specifier: string,
  projectRoot: string,
): string | undefined {
  const normalizedSpecifier = normalizeRelativePath(specifier);
  const normalizedProjectRoot = normalizeRelativePath(projectRoot).replace(
    /\/$/,
    '',
  );
  const normalizeResolvedPath = (resolvedPath: string): string =>
    normalizeRelativePath(path.posix.normalize(resolvedPath));

  if (normalizedSpecifier.startsWith('@/')) {
    return normalizeResolvedPath(normalizedSpecifier.slice(2));
  }

  if (normalizedSpecifier.startsWith('@lib/')) {
    return normalizeResolvedPath(
      `lib/${normalizedSpecifier.slice('@lib/'.length)}`,
    );
  }

  if (normalizedSpecifier.startsWith('@components/')) {
    return normalizeResolvedPath(
      `components/${normalizedSpecifier.slice('@components/'.length)}`,
    );
  }

  if (
    normalizedSpecifier.startsWith('./') ||
    normalizedSpecifier.startsWith('../')
  ) {
    return normalizeResolvedPath(
      path.posix.join(path.posix.dirname(relativePath), normalizedSpecifier),
    );
  }

  if (normalizedSpecifier.startsWith('/')) {
    const normalizedAbsoluteSpecifier =
      normalizeResolvedPath(normalizedSpecifier);

    if (normalizedAbsoluteSpecifier.startsWith(`${normalizedProjectRoot}/`)) {
      return normalizeResolvedPath(
        normalizedAbsoluteSpecifier.slice(normalizedProjectRoot.length + 1),
      );
    }

    return normalizeResolvedPath(
      normalizedAbsoluteSpecifier.replace(/^\/+/, ''),
    );
  }

  return undefined;
}

function getRealResolvedRuntimePath(
  projectRoot: string,
  resolvedSpecifier: string,
): string | undefined {
  const absoluteCandidate = path.resolve(projectRoot, resolvedSpecifier);
  const extensionCandidates = path.extname(absoluteCandidate)
    ? [absoluteCandidate]
    : Array.from(sourceFileExtensions).flatMap((extension) => [
        `${absoluteCandidate}${extension}`,
        path.join(absoluteCandidate, `index${extension}`),
      ]);
  const projectRootRealPath = fs.realpathSync(projectRoot);

  for (const candidate of extensionCandidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const candidateRealPath = fs.realpathSync(candidate);

    if (candidateRealPath.startsWith(`${projectRootRealPath}${path.sep}`)) {
      return toRelativePath(projectRootRealPath, candidateRealPath);
    }
  }

  return undefined;
}

function getAssignedValues(content: string): Map<string, string> {
  const assignedValues = new Map<string, string>();

  for (const match of content.matchAll(assignedValuePattern)) {
    const identifier = match[1] ?? match[3] ?? match[5] ?? match[7];
    const assignedValue = match[2] ?? match[4] ?? match[6] ?? match[8] ?? '';

    assignedValues.set(identifier, assignedValue);
  }

  return assignedValues;
}

function expandAssignedValue(
  assignedValue: string,
  assignedValues: Map<string, string>,
): string {
  const referencedValues = Array.from(assignedValues).flatMap(
    ([identifier, value]) =>
      createIdentifierReferencePattern(identifier).test(assignedValue)
        ? [value]
        : [],
  );

  return [assignedValue, ...referencedValues].join(' ');
}

function getStringLiteralValue(content: string): string | undefined {
  const match = content.trim().match(/^['"`]([^'"`]+)['"`]$/);

  return match?.[1];
}

function getTaintedVendorPathIdentifiers(
  assignedValues: Map<string, string>,
  relativePath: string,
  projectRoot: string,
): Set<string> {
  const identifiers = new Set<string>();

  let changed = true;

  while (changed) {
    changed = false;

    for (const [identifier, assignedValue] of assignedValues) {
      const expandedValue = expandAssignedValue(assignedValue, assignedValues);
      const assignedLiteralValue = getStringLiteralValue(assignedValue);
      const resolvedSpecifier =
        assignedLiteralValue === undefined
          ? undefined
          : resolveRuntimeSpecifier(
              relativePath,
              assignedLiteralValue,
              projectRoot,
            );
      const realResolvedSpecifier =
        resolvedSpecifier === undefined
          ? undefined
          : getRealResolvedRuntimePath(projectRoot, resolvedSpecifier);

      if (
        !identifiers.has(identifier) &&
        (containsDirectPvpokeVendorPath(expandedValue) ||
          containsConstructedPvpokeVendorJsPath(expandedValue) ||
          (realResolvedSpecifier !== undefined &&
            containsDirectPvpokeVendorPath(realResolvedSpecifier)) ||
          containsTaintedIdentifier(expandedValue, identifiers))
      ) {
        identifiers.add(identifier);
        changed = true;
      }
    }
  }

  return identifiers;
}

function getTaintedExcludedSubtreeIdentifiers(
  content: string,
  assignedValues: Map<string, string>,
  excludedRuntimeSubtrees: string[],
  relativePath: string,
  projectRoot: string,
): Set<string> {
  const identifiers = new Set<string>();

  let changed = true;

  while (changed) {
    changed = false;

    for (const [identifier, assignedValue] of assignedValues) {
      const expandedValue = expandAssignedValue(assignedValue, assignedValues);
      const assignedLiteralValue = getStringLiteralValue(assignedValue);
      const resolvedSpecifier =
        assignedLiteralValue === undefined
          ? undefined
          : resolveRuntimeSpecifier(
              relativePath,
              assignedLiteralValue,
              projectRoot,
            );

      if (
        !identifiers.has(identifier) &&
        ((resolvedSpecifier !== undefined &&
          isInExcludedSubtree(resolvedSpecifier, excludedRuntimeSubtrees)) ||
          containsConstructedExcludedRuntimeSubtree(
            expandedValue,
            excludedRuntimeSubtrees,
          ) ||
          containsTaintedIdentifier(expandedValue, identifiers))
      ) {
        identifiers.add(identifier);
        changed = true;
      }
    }
  }

  return identifiers;
}

function containsCombinedAssignedExcludedSubtree(
  content: string,
  assignedValues: Map<string, string>,
  excludedRuntimeSubtrees: string[],
): boolean {
  const combinedReferencedValues = Array.from(assignedValues)
    .flatMap(([identifier, value]) =>
      createIdentifierReferencePattern(identifier).test(content) ? [value] : [],
    )
    .join(' ');

  return containsConstructedExcludedRuntimeSubtree(
    combinedReferencedValues,
    excludedRuntimeSubtrees,
  );
}

function containsCombinedAssignedPvpokeVendorJsPath(
  content: string,
  assignedValues: Map<string, string>,
): boolean {
  const combinedReferencedValues = Array.from(assignedValues)
    .flatMap(([identifier, value]) =>
      createIdentifierReferencePattern(identifier).test(content) ? [value] : [],
    )
    .join(' ');

  return containsConstructedPvpokeVendorJsPath(
    `${content} ${combinedReferencedValues}`,
  );
}

function containsDirectExcludedRuntimeSpecifier(
  relativePath: string,
  content: string,
  excludedRuntimeSubtrees: string[],
  projectRoot: string,
): boolean {
  const stringLiterals = content.matchAll(/['"`]([^'"`]+)['"`]/g);

  for (const match of stringLiterals) {
    const specifier = match[1] ?? '';
    const resolvedSpecifier = resolveRuntimeSpecifier(
      relativePath,
      specifier,
      projectRoot,
    );

    if (
      resolvedSpecifier !== undefined &&
      isInExcludedSubtree(resolvedSpecifier, excludedRuntimeSubtrees)
    ) {
      return true;
    }
  }

  return false;
}

function containsRealPvpokeRuntimeSpecifier(
  relativePath: string,
  content: string,
  projectRoot: string,
): boolean {
  const stringLiterals = content.matchAll(/['"`]([^'"`]+)['"`]/g);

  for (const match of stringLiterals) {
    const specifier = match[1] ?? '';
    const resolvedSpecifier = resolveRuntimeSpecifier(
      relativePath,
      specifier,
      projectRoot,
    );
    const realResolvedSpecifier =
      resolvedSpecifier === undefined
        ? undefined
        : getRealResolvedRuntimePath(projectRoot, resolvedSpecifier);

    if (
      realResolvedSpecifier !== undefined &&
      containsDirectPvpokeVendorPath(realResolvedSpecifier)
    ) {
      return true;
    }
  }

  return false;
}

function containsTaintedIdentifier(
  content: string,
  taintedIdentifiers: Set<string>,
): boolean {
  return Array.from(taintedIdentifiers).some((identifier) =>
    createIdentifierReferencePattern(identifier).test(content),
  );
}

interface LoaderAliasIdentifiers {
  createRequireFactories: Set<string>;
  loaders: Set<string>;
}

function getLoaderAliasIdentifiers(
  content: string,
  assignedValues: Map<string, string>,
): LoaderAliasIdentifiers {
  const identifiers = new Set<string>();
  const createRequireFactoryIdentifiers = new Set(['createRequire']);
  const loaderAliasPattern =
    /\bcreateRequire\s*\(|\brequire\b|\b(?:fs\.)?(?:readFileSync|readFile|createReadStream)\b|\bfs\.promises\.readFile\b|\[['"](?:readFileSync|readFile|createReadStream|require)['"]\]/;

  function getNamedImportAliases(
    sourceModules: string[],
    importedNames: string[],
  ): string[] {
    const aliases: string[] = [];
    const sourcePattern = sourceModules
      .map((sourceModule) =>
        sourceModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('|');

    for (const match of content.matchAll(
      new RegExp(
        `\\bimport\\s*\\{([^}]+)\\}\\s*from\\s*['"](?:${sourcePattern})['"]`,
        'g',
      ),
    )) {
      const importedBindings = match[1] ?? '';

      for (const binding of importedBindings.split(',')) {
        const [sourceName, aliasName] = binding
          .split(/\s+as\s+/)
          .map((part) => part.trim());

        if (sourceName !== undefined && importedNames.includes(sourceName)) {
          aliases.push(aliasName ?? sourceName);
        }
      }
    }

    return aliases;
  }

  for (const alias of getNamedImportAliases(
    ['node:module', 'module'],
    ['createRequire'],
  )) {
    createRequireFactoryIdentifiers.add(alias);
  }

  for (const alias of getNamedImportAliases(
    ['node:fs', 'fs'],
    ['readFileSync', 'readFile', 'createReadStream'],
  )) {
    identifiers.add(alias);
  }

  for (const alias of getNamedImportAliases(
    ['node:fs/promises', 'fs/promises'],
    ['readFile'],
  )) {
    identifiers.add(alias);
  }

  function addCommonJsDestructuredAliases(
    sourceModules: string[],
    importedNames: string[],
    targetIdentifiers: Set<string>,
  ): void {
    const sourcePattern = sourceModules
      .map((sourceModule) =>
        sourceModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('|');

    for (const match of content.matchAll(
      new RegExp(
        `\\b(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*require\\(\\s*['"](?:${sourcePattern})['"]\\s*\\)`,
        'g',
      ),
    )) {
      const importedBindings = match[1] ?? '';

      for (const binding of importedBindings.split(',')) {
        const [sourceName, aliasName] = binding
          .split(':')
          .map((part) => part.trim());

        if (sourceName !== undefined && importedNames.includes(sourceName)) {
          targetIdentifiers.add(aliasName ?? sourceName);
        }
      }
    }
  }

  addCommonJsDestructuredAliases(
    ['node:module', 'module'],
    ['createRequire'],
    createRequireFactoryIdentifiers,
  );
  addCommonJsDestructuredAliases(
    ['node:fs', 'fs'],
    ['readFileSync', 'readFile', 'createReadStream'],
    identifiers,
  );
  addCommonJsDestructuredAliases(
    ['node:fs/promises', 'fs/promises'],
    ['readFile'],
    identifiers,
  );

  let changed = true;

  while (changed) {
    changed = false;

    for (const [identifier, assignedValue] of assignedValues) {
      const trimmedValue = assignedValue.trim();
      const callsCreateRequireFactory = Array.from(
        createRequireFactoryIdentifiers,
      ).some((factoryIdentifier) =>
        new RegExp(
          `(?<![A-Za-z0-9_$])${escapeRegExp(factoryIdentifier)}\\s*\\(`,
        ).test(trimmedValue),
      );
      const aliasesCreateRequireFactory = Array.from(
        createRequireFactoryIdentifiers,
      ).some((factoryIdentifier) =>
        new RegExp(`^${escapeRegExp(factoryIdentifier)}$`).test(trimmedValue),
      );
      const aliasesLoaderResolve = Array.from(identifiers).some(
        (loaderIdentifier) =>
          new RegExp(
            `^${escapeRegExp(loaderIdentifier)}\\s*\\.\\s*resolve$`,
          ).test(trimmedValue),
      );
      const aliasesLoaderIdentifier = Array.from(identifiers).some(
        (loaderIdentifier) =>
          new RegExp(`^${escapeRegExp(loaderIdentifier)}$`).test(trimmedValue),
      );

      if (
        aliasesCreateRequireFactory &&
        !createRequireFactoryIdentifiers.has(identifier)
      ) {
        createRequireFactoryIdentifiers.add(identifier);
        changed = true;
      }

      if (
        !identifiers.has(identifier) &&
        (loaderAliasPattern.test(assignedValue) ||
          callsCreateRequireFactory ||
          aliasesLoaderResolve ||
          aliasesLoaderIdentifier)
      ) {
        identifiers.add(identifier);
        changed = true;
      }
    }
  }

  for (const match of content.matchAll(
    /\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*fs\s*;/g,
  )) {
    const destructuredBindings = match[1] ?? '';

    for (const binding of destructuredBindings.split(',')) {
      const [sourceName, aliasName] = binding
        .split(':')
        .map((part) => part.trim());

      if (
        sourceName !== undefined &&
        ['readFileSync', 'readFile', 'createReadStream'].includes(sourceName)
      ) {
        identifiers.add(aliasName ?? sourceName);
      }
    }
  }

  return {
    createRequireFactories: createRequireFactoryIdentifiers,
    loaders: identifiers,
  };
}

function listRuntimeSourceFiles(
  projectRoot: string,
  runtimeRoots: string[],
  excludedRuntimeSubtrees: string[],
): string[] {
  const sourceFiles: string[] = [];
  const visitedRealPaths = new Set<string>();

  function visit(directoryPath: string): void {
    const directoryRealPath = fs.realpathSync(directoryPath);

    if (visitedRealPaths.has(directoryRealPath)) {
      return;
    }

    visitedRealPaths.add(directoryRealPath);

    for (const entry of fs.readdirSync(directoryPath, {
      withFileTypes: true,
    })) {
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = toRelativePath(projectRoot, entryPath);

      if (isInExcludedSubtree(relativePath, excludedRuntimeSubtrees)) {
        continue;
      }

      if (entry.isSymbolicLink()) {
        const stats = fs.statSync(entryPath);

        if (stats.isDirectory()) {
          visit(entryPath);
          continue;
        }

        if (
          stats.isFile() &&
          isSourceFile(entryPath) &&
          !isExcludedFile(relativePath)
        ) {
          sourceFiles.push(entryPath);
        }

        continue;
      }

      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (
        entry.isFile() &&
        isSourceFile(entryPath) &&
        !isExcludedFile(relativePath)
      ) {
        sourceFiles.push(entryPath);
      }
    }
  }

  for (const runtimeRoot of runtimeRoots) {
    const rootPath = path.resolve(projectRoot, runtimeRoot);

    if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
      const relativePath = toRelativePath(projectRoot, rootPath);

      if (
        isSourceFile(rootPath) &&
        !isExcludedFile(relativePath) &&
        !isInExcludedSubtree(relativePath, excludedRuntimeSubtrees)
      ) {
        sourceFiles.push(rootPath);
      }

      continue;
    }

    if (fs.existsSync(rootPath)) {
      visit(rootPath);
    }
  }

  return sourceFiles.sort();
}

function collectViolationsFromContent(
  projectRoot: string,
  relativePath: string,
  content: string,
  excludedRuntimeSubtrees: string[],
): PvpokeRuntimeBoundaryViolation[] {
  const normalizedPath = normalizeRelativePath(relativePath);
  const violations = new Map<string, PvpokeRuntimeBoundaryViolation>();
  const assignedValues = getAssignedValues(content);
  const taintedVendorPathIdentifiers = getTaintedVendorPathIdentifiers(
    assignedValues,
    normalizedPath,
    projectRoot,
  );
  const taintedExcludedSubtreeIdentifiers =
    getTaintedExcludedSubtreeIdentifiers(
      content,
      assignedValues,
      excludedRuntimeSubtrees,
      normalizedPath,
      projectRoot,
    );
  const loaderAliasIdentifiers = getLoaderAliasIdentifiers(
    content,
    assignedValues,
  );

  function addViolation(index: number): void {
    const line = getLineNumber(content, index);
    const key = `${normalizedPath}:${line}`;

    violations.set(key, {
      path: normalizedPath,
      line,
      reason: 'imports or loads PvPoke vendor JavaScript',
    });
  }

  const moduleSpecifierContent = maskComments(content);

  for (const match of moduleSpecifierContent.matchAll(
    runtimeModuleSpecifierPattern,
  )) {
    const specifier = match[1] ?? match[2] ?? '';
    const matchIndex = match.index ?? 0;

    if (
      isInsideCommentOrString(content, matchIndex) ||
      isTypeOnlyDynamicImport(content, matchIndex) ||
      isTypeOnlyNamedModuleSpecifier(match[0])
    ) {
      continue;
    }

    const resolvedSpecifier = resolveRuntimeSpecifier(
      normalizedPath,
      specifier,
      projectRoot,
    );
    const realResolvedSpecifier =
      resolvedSpecifier === undefined
        ? undefined
        : getRealResolvedRuntimePath(projectRoot, resolvedSpecifier);

    if (
      containsDirectPvpokeVendorPath(specifier) ||
      (resolvedSpecifier !== undefined &&
        (containsDirectPvpokeVendorPath(resolvedSpecifier) ||
          isInExcludedSubtree(resolvedSpecifier, excludedRuntimeSubtrees))) ||
      (realResolvedSpecifier !== undefined &&
        (containsDirectPvpokeVendorPath(realResolvedSpecifier) ||
          isInExcludedSubtree(realResolvedSpecifier, excludedRuntimeSubtrees)))
    ) {
      addViolation(matchIndex);
    }
  }

  function isExecutableCallMatch(matchIndex: number): boolean {
    return (
      !isInsideCommentOrString(content, matchIndex) &&
      !isTypeOnlyDynamicImport(content, matchIndex)
    );
  }

  function containsBoundaryCallViolation(callContent: string): boolean {
    return (
      containsDirectPvpokeVendorPath(callContent) ||
      containsConstructedPvpokeVendorJsPath(callContent) ||
      containsCombinedAssignedPvpokeVendorJsPath(callContent, assignedValues) ||
      containsTaintedIdentifier(callContent, taintedVendorPathIdentifiers) ||
      containsTaintedIdentifier(
        callContent,
        taintedExcludedSubtreeIdentifiers,
      ) ||
      containsConstructedExcludedRuntimeSubtree(
        callContent,
        excludedRuntimeSubtrees,
      ) ||
      containsCombinedAssignedExcludedSubtree(
        callContent,
        assignedValues,
        excludedRuntimeSubtrees,
      ) ||
      containsDirectExcludedRuntimeSpecifier(
        normalizedPath,
        callContent,
        excludedRuntimeSubtrees,
        projectRoot,
      ) ||
      containsRealPvpokeRuntimeSpecifier(
        normalizedPath,
        callContent,
        projectRoot,
      )
    );
  }

  const callScanContent = maskComments(content);

  for (const match of callScanContent.matchAll(
    pvpokeVendorRuntimeLoadPattern,
  )) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const callContent = match[0];

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(genericCallPattern)) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const callName = match[1] ?? '';
    const callContent = match[0];

    if (nonLoaderCallNames.has(callName)) {
      continue;
    }

    if (!loaderAliasIdentifiers.loaders.has(callName)) {
      continue;
    }

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(loaderCallVariantPattern)) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const callName = match[1] ?? '';
    const callContent = match[0];
    const isIntrinsicLoader = [
      'require',
      'readFileSync',
      'readFile',
      'createReadStream',
    ].includes(callName);

    if (!isIntrinsicLoader && !loaderAliasIdentifiers.loaders.has(callName)) {
      continue;
    }

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(bracketCallPattern)) {
    const matchIndex = match.index ?? 0;
    const bracketTarget = match[1] ?? '';
    const bracketMember = match[2] ?? '';

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const isLoaderBracketCall =
      (['require'].includes(bracketMember) &&
        ['globalThis', 'window', 'global'].includes(bracketTarget)) ||
      (['readFileSync', 'readFile', 'createReadStream'].includes(
        bracketMember,
      ) &&
        (bracketTarget === 'fs' ||
          loaderAliasIdentifiers.loaders.has(bracketTarget))) ||
      (bracketMember === 'resolve' &&
        (bracketTarget === 'require' ||
          loaderAliasIdentifiers.loaders.has(bracketTarget)));

    if (!isLoaderBracketCall) {
      continue;
    }

    const callContent = match[0];

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(
    chainedCreateRequireCallPattern,
  )) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const factoryIdentifier = match[1] ?? '';
    const callContent = match[0];

    if (!loaderAliasIdentifiers.createRequireFactories.has(factoryIdentifier)) {
      continue;
    }

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(
    inlineCreateRequireResolveCallPattern,
  )) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const factoryIdentifier = match[1] ?? '';
    const callContent = match[0];

    if (!loaderAliasIdentifiers.createRequireFactories.has(factoryIdentifier)) {
      continue;
    }

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(memberResolveCallPattern)) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const memberTarget = match[1] ?? '';
    const callContent = match[0];

    if (
      memberTarget !== 'require' &&
      !loaderAliasIdentifiers.loaders.has(memberTarget)
    ) {
      continue;
    }

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(
    indirectCreateRequireCallPattern,
  )) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const factoryIdentifier = match[1] ?? '';
    const callContent = match[0];

    if (!loaderAliasIdentifiers.createRequireFactories.has(factoryIdentifier)) {
      continue;
    }

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  for (const match of callScanContent.matchAll(memberResolveVariantPattern)) {
    const matchIndex = match.index ?? 0;

    if (!isExecutableCallMatch(matchIndex)) {
      continue;
    }

    const memberTarget = match[1] ?? '';
    const callContent = match[0];

    if (
      memberTarget !== 'require' &&
      !loaderAliasIdentifiers.loaders.has(memberTarget)
    ) {
      continue;
    }

    if (containsBoundaryCallViolation(callContent)) {
      addViolation(matchIndex);
    }
  }

  return Array.from(violations.values());
}

/**
 * Finds app/runtime source files that import, require, or load PvPoke vendor JS.
 */
export function findPvpokeVendorRuntimeDependencies(
  options: PvpokeRuntimeBoundaryOptions,
): PvpokeRuntimeBoundaryViolation[] {
  const excludedRuntimeSubtrees = options.excludedRuntimeSubtrees ?? [];
  const runtimeSourceFiles = listRuntimeSourceFiles(
    options.projectRoot,
    options.runtimeRoots,
    excludedRuntimeSubtrees,
  );
  const discoveredViolations = runtimeSourceFiles.flatMap((filePath) =>
    collectViolationsFromContent(
      options.projectRoot,
      toRelativePath(options.projectRoot, filePath),
      fs.readFileSync(filePath, 'utf8'),
      excludedRuntimeSubtrees,
    ),
  );
  const virtualViolations = Array.from(options.virtualFiles ?? [])
    .filter(([relativePath]) => !isExcludedFile(relativePath))
    .filter(
      ([relativePath]) =>
        !isInExcludedSubtree(relativePath, excludedRuntimeSubtrees),
    )
    .flatMap(([relativePath, content]) =>
      collectViolationsFromContent(
        options.projectRoot,
        relativePath,
        content,
        excludedRuntimeSubtrees,
      ),
    );

  return [...discoveredViolations, ...virtualViolations].sort((a, b) =>
    a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path),
  );
}

/**
 * Throws when runtime app code crosses the PvPoke reference-only boundary.
 */
export function assertNoPvpokeVendorRuntimeDependency(
  options: PvpokeRuntimeBoundaryOptions,
): void {
  const violations = findPvpokeVendorRuntimeDependencies(options);

  if (violations.length === 0) {
    return;
  }

  const formattedViolations = violations
    .map(
      (violation) => `${violation.path}:${violation.line} ${violation.reason}`,
    )
    .join('\n');

  throw new Error(
    `PvPoke vendor JavaScript must remain reference-only for runtime app code.\n${formattedViolations}`,
  );
}

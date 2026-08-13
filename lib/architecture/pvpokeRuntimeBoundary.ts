import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

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

/** Inputs for deriving local runtime dependencies from application entrypoints. */
export interface RuntimeModuleDependencyOptions {
  projectRoot: string;
  entrypoints: string[];
}

const runtimeResolutionExtensions = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
] as const;
const sourceFileExtensions = new Set<string>(runtimeResolutionExtensions);

const excludedFilePatterns = [
  '.test.',
  '.spec.',
  '.d.ts',
  `${path.sep}__tests__${path.sep}`,
];

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

function isRecognizableRuntimeDataAuthority(relativePath: string): boolean {
  const lowercasePath = relativePath.toLowerCase();
  const basename = lowercasePath.split('/').at(-1);
  return (
    lowercasePath.endsWith('.csv') ||
    basename === 'moveset-variants.json' ||
    basename === 'runtime-asset-index.json' ||
    basename === 'runtime-snapshot.json' ||
    basename === 'moves.json' ||
    basename === 'pokemon.json' ||
    basename === 'type-effectiveness.json'
  );
}

/**
 * Return whether one team-details dependency stays within runtime authorities.
 */
export function isTeamDetailsRuntimeAuthorityDependencyAllowed(
  relativePath: string,
  allowedDataAssets: ReadonlySet<string>,
): boolean {
  const relativePathInput = normalizeRelativePath(relativePath);
  const normalizedPath = path.posix.normalize(relativePathInput);
  if (
    path.win32.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePathInput) ||
    path.posix.isAbsolute(relativePathInput) ||
    path.posix.isAbsolute(normalizedPath) ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../')
  ) {
    return false;
  }

  if (
    normalizedPath.startsWith('lib/sync/') ||
    normalizedPath.startsWith('lib/scripts/') ||
    normalizedPath.startsWith('vendor/pvpoke/') ||
    normalizedPath.endsWith('/movesetVariantSimulations.ts') ||
    normalizedPath.endsWith('/runtimeSimulationAssetIndex.ts')
  ) {
    return false;
  }

  if (
    normalizedPath.startsWith('data/') ||
    isRecognizableRuntimeDataAuthority(normalizedPath)
  ) {
    return allowedDataAssets.has(normalizedPath);
  }

  return true;
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

interface SourceRange {
  readonly start: number;
  readonly end: number;
}

interface RuntimeModuleSpecifier {
  readonly specifier: string;
  readonly start: number;
}

function unwrapModuleSpecifierExpression(node: ts.Expression): ts.Expression {
  let current = node;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isPartiallyEmittedExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function unwrapLoaderBindingExpression(node: ts.Expression): ts.Expression {
  let current = unwrapModuleSpecifierExpression(node);
  while (
    ts.isBinaryExpression(current) &&
    (current.operatorToken.kind === ts.SyntaxKind.CommaToken ||
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken)
  ) {
    current = unwrapModuleSpecifierExpression(current.right);
  }
  return current;
}

function createSourceFile(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
}

function isTypeOnlyImportDeclaration(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  const namedImports =
    clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings.elements
      : undefined;

  return Boolean(
    clause?.isTypeOnly ||
    (clause?.name === undefined &&
      namedImports !== undefined &&
      namedImports.length > 0 &&
      namedImports.every((specifier) => specifier.isTypeOnly)),
  );
}

function isTypeOnlyExportDeclaration(node: ts.ExportDeclaration): boolean {
  const namedExports =
    node.exportClause && ts.isNamedExports(node.exportClause)
      ? node.exportClause.elements
      : undefined;

  return Boolean(
    node.isTypeOnly ||
    (namedExports !== undefined &&
      namedExports.length > 0 &&
      namedExports.every((specifier) => specifier.isTypeOnly)),
  );
}

function getLiteralModuleSpecifier(node: ts.Node): string | undefined {
  if (!ts.isExpression(node)) {
    return undefined;
  }
  const expression = unwrapModuleSpecifierExpression(node);

  return ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text
    : undefined;
}

function getStaticPropertyName(node: ts.Expression): string | undefined {
  const expression = unwrapModuleSpecifierExpression(node);
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    expression.argumentExpression
  ) {
    return getLiteralModuleSpecifier(expression.argumentExpression);
  }
  return undefined;
}

function isProcessModuleSource(node: ts.Node): boolean {
  return ['node:process', 'process'].includes(
    getLiteralModuleSpecifier(node) ?? '',
  );
}

function isProcessNamespaceExpression(
  node: ts.Expression,
  processOwners: ReadonlySet<string>,
): boolean {
  const expression = unwrapLoaderBindingExpression(node);
  if (ts.isIdentifier(expression)) {
    return processOwners.has(expression.text);
  }
  if (ts.isAwaitExpression(expression)) {
    return isProcessNamespaceExpression(expression.expression, processOwners);
  }
  if (
    (ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)) &&
    getStaticPropertyName(expression) === 'default'
  ) {
    return isProcessNamespaceExpression(expression.expression, processOwners);
  }
  if (!ts.isCallExpression(expression)) {
    return false;
  }
  if (expression.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const source = expression.arguments[0];
    return source !== undefined && isProcessModuleSource(source);
  }
  const callee = unwrapModuleSpecifierExpression(expression.expression);
  return (
    ts.isIdentifier(callee) &&
    callee.text === 'require' &&
    expression.arguments[0] !== undefined &&
    isProcessModuleSource(expression.arguments[0])
  );
}

function isProcessGetBuiltinModuleFactoryExpression(
  node: ts.Expression,
  factories: ReadonlySet<string>,
  processOwners: ReadonlySet<string>,
  isProcessNamespace: (node: ts.Expression) => boolean = (expression) =>
    isProcessNamespaceExpression(expression, processOwners),
): boolean {
  const expression = unwrapLoaderBindingExpression(node);
  if (ts.isIdentifier(expression)) {
    return factories.has(expression.text);
  }
  if (
    !ts.isPropertyAccessExpression(expression) &&
    !ts.isElementAccessExpression(expression)
  ) {
    return false;
  }
  const target = unwrapModuleSpecifierExpression(expression.expression);
  return (
    isProcessNamespace(target) &&
    getStaticPropertyName(expression) === 'getBuiltinModule'
  );
}

function getProcessBuiltinModuleArgument(
  node: ts.Expression,
  factories: ReadonlySet<string>,
  processOwners: ReadonlySet<string>,
  isProcessNamespace?: (node: ts.Expression) => boolean,
): ts.Expression | null | undefined {
  const expression = unwrapModuleSpecifierExpression(node);
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  const callee = unwrapModuleSpecifierExpression(expression.expression);
  if (
    isProcessGetBuiltinModuleFactoryExpression(
      callee,
      factories,
      processOwners,
      isProcessNamespace,
    )
  ) {
    return expression.arguments[0] ?? null;
  }
  if (
    !ts.isPropertyAccessExpression(callee) &&
    !ts.isElementAccessExpression(callee)
  ) {
    return undefined;
  }
  const callType = getStaticPropertyName(callee);
  if (
    (callType !== 'call' && callType !== 'apply') ||
    !isProcessGetBuiltinModuleFactoryExpression(
      callee.expression,
      factories,
      processOwners,
      isProcessNamespace,
    )
  ) {
    return undefined;
  }
  if (callType === 'call') {
    return expression.arguments[1] ?? null;
  }
  const argumentList = expression.arguments[1]
    ? unwrapModuleSpecifierExpression(expression.arguments[1])
    : undefined;
  const source =
    argumentList && ts.isArrayLiteralExpression(argumentList)
      ? argumentList.elements[0]
      : undefined;
  return source && ts.isExpression(source) ? source : null;
}

function getProcessBuiltinModuleSpecifier(
  node: ts.Expression,
  factories: ReadonlySet<string>,
  processOwners: ReadonlySet<string>,
  isProcessNamespace?: (node: ts.Expression) => boolean,
): string | undefined {
  const source = getProcessBuiltinModuleArgument(
    node,
    factories,
    processOwners,
    isProcessNamespace,
  );
  return source === undefined || source === null
    ? undefined
    : getLiteralModuleSpecifier(source);
}

function getCommonJsLoaderIdentifiers(sourceFile: ts.SourceFile): {
  readonly factories: ReadonlySet<string>;
  readonly globalOwners: ReadonlySet<string>;
  readonly loaders: ReadonlySet<string>;
  readonly moduleOwners: ReadonlySet<string>;
  readonly moduleNamespaces: ReadonlySet<string>;
  readonly processBuiltinModuleFactories: ReadonlySet<string>;
  readonly processOwners: ReadonlySet<string>;
  readonly unresolvedMembers: ReadonlySet<ts.Node>;
} {
  const factories = new Set(['createRequire']);
  const globalOwners = new Set(['global', 'globalThis']);
  const loaders = new Set(['require']);
  const moduleOwners = new Set(['module']);
  const loaderOwners = new Set([...globalOwners, ...moduleOwners]);
  const moduleNamespaces = new Set<string>();
  const processBuiltinModuleFactories = new Set<string>();
  const processOwners = new Set(['process']);
  const unresolvedMembers = new Set<ts.Node>();
  const variableDeclarations: ts.VariableDeclaration[] = [];
  const assignmentExpressions: Array<{
    readonly identifier: string;
    readonly initializer: ts.Expression;
  }> = [];

  function isModuleSource(node: ts.Node): boolean {
    const source = getLiteralModuleSpecifier(node);
    return source === 'node:module' || source === 'module';
  }

  function isModuleNamespaceExpression(node: ts.Expression): boolean {
    const expression = unwrapModuleSpecifierExpression(node);
    if (ts.isIdentifier(expression)) {
      return moduleNamespaces.has(expression.text);
    }
    if (ts.isAwaitExpression(expression)) {
      return isModuleNamespaceExpression(expression.expression);
    }
    if (!ts.isCallExpression(expression)) {
      return false;
    }
    if (
      getProcessBuiltinModuleArgument(
        expression,
        processBuiltinModuleFactories,
        processOwners,
        isTrackedProcessNamespaceExpression,
      ) !== undefined
    ) {
      return ['node:module', 'module'].includes(
        getProcessBuiltinModuleSpecifier(
          expression,
          processBuiltinModuleFactories,
          processOwners,
          isTrackedProcessNamespaceExpression,
        ) ?? '',
      );
    }
    if (expression.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const source = expression.arguments[0];
      return source !== undefined && isModuleSource(source);
    }
    return ['node:module', 'module'].includes(
      getCommonJsLoadedModuleSpecifier(
        expression,
        factories,
        loaders,
        loaderOwners,
        moduleNamespaces,
        processBuiltinModuleFactories,
        processOwners,
        isTrackedProcessNamespaceExpression,
      ) ?? '',
    );
  }

  function isTrackedProcessNamespaceExpression(node: ts.Expression): boolean {
    if (isProcessNamespaceExpression(node, processOwners)) {
      return true;
    }
    const expression = unwrapLoaderBindingExpression(node);
    if (ts.isAwaitExpression(expression)) {
      return isTrackedProcessNamespaceExpression(expression.expression);
    }
    const processBuiltinModuleArgument = ts.isCallExpression(expression)
      ? getProcessBuiltinModuleArgument(
          expression,
          processBuiltinModuleFactories,
          processOwners,
          isTrackedProcessNamespaceExpression,
        )
      : undefined;
    if (processBuiltinModuleArgument !== undefined) {
      return (
        processBuiltinModuleArgument !== null &&
        isProcessModuleSource(processBuiltinModuleArgument)
      );
    }
    return (
      ts.isCallExpression(expression) &&
      ['node:process', 'process'].includes(
        getCommonJsLoadedModuleSpecifier(
          expression,
          factories,
          loaders,
          loaderOwners,
          moduleNamespaces,
          processBuiltinModuleFactories,
          processOwners,
          isTrackedProcessNamespaceExpression,
        ) ?? '',
      )
    );
  }

  function isGlobalLoaderOwnerExpression(node: ts.Expression): boolean {
    const expression = unwrapLoaderBindingExpression(node);
    if (ts.isIdentifier(expression)) {
      return globalOwners.has(expression.text);
    }
    if (
      (ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression)) &&
      getStaticPropertyName(expression) === 'global'
    ) {
      return isGlobalLoaderOwnerExpression(expression.expression);
    }
    return false;
  }

  function isCreateRequireFactoryExpression(node: ts.Expression): boolean {
    const expression = unwrapLoaderBindingExpression(node);
    if (ts.isIdentifier(expression)) {
      return factories.has(expression.text);
    }
    if (
      (ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression)) &&
      getStaticPropertyName(expression) === 'createRequire'
    ) {
      const target = unwrapModuleSpecifierExpression(expression.expression);
      return isModuleNamespaceExpression(target);
    }
    return false;
  }

  function collect(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      isModuleSource(node.moduleSpecifier) &&
      node.importClause &&
      !node.importClause.isTypeOnly
    ) {
      const { importClause } = node;
      if (importClause.name) {
        moduleNamespaces.add(importClause.name.text);
      }
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          moduleNamespaces.add(importClause.namedBindings.name.text);
        } else {
          for (const specifier of importClause.namedBindings.elements) {
            if (specifier.isTypeOnly) {
              continue;
            }
            const importedName =
              specifier.propertyName?.text ?? specifier.name.text;
            if (importedName === 'createRequire') {
              factories.add(specifier.name.text);
            } else if (
              importedName === 'default' ||
              importedName === 'Module'
            ) {
              moduleNamespaces.add(specifier.name.text);
            }
          }
        }
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      isProcessModuleSource(node.moduleSpecifier) &&
      node.importClause &&
      !node.importClause.isTypeOnly
    ) {
      const { importClause } = node;
      if (importClause.name) {
        processOwners.add(importClause.name.text);
      }
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          processOwners.add(importClause.namedBindings.name.text);
        } else {
          for (const specifier of importClause.namedBindings.elements) {
            if (specifier.isTypeOnly) {
              continue;
            }
            const importedName =
              specifier.propertyName?.text ?? specifier.name.text;
            if (importedName === 'getBuiltinModule') {
              processBuiltinModuleFactories.add(specifier.name.text);
            } else if (importedName === 'default') {
              processOwners.add(specifier.name.text);
            }
          }
        }
      }
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      isModuleSource(node.moduleReference.expression)
    ) {
      moduleNamespaces.add(node.name.text);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      isProcessModuleSource(node.moduleReference.expression)
    ) {
      processOwners.add(node.name.text);
    }
    if (ts.isVariableDeclaration(node)) {
      variableDeclarations.push(node);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const target = unwrapModuleSpecifierExpression(node.left);
      if (ts.isIdentifier(target)) {
        assignmentExpressions.push({
          identifier: target.text,
          initializer: node.right,
        });
      }
    }
    ts.forEachChild(node, collect);
  }

  collect(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of variableDeclarations) {
      if (ts.isObjectBindingPattern(declaration.name)) {
        if (!declaration.initializer) {
          continue;
        }
        const initializer = unwrapModuleSpecifierExpression(
          declaration.initializer,
        );
        const isModuleNamespace = isModuleNamespaceExpression(initializer);
        const isCommonJsModuleObject =
          ts.isIdentifier(initializer) && loaderOwners.has(initializer.text);
        const isGlobalLoaderOwner = isGlobalLoaderOwnerExpression(initializer);
        const isProcessObject =
          isTrackedProcessNamespaceExpression(initializer);
        if (
          !isModuleNamespace &&
          !isCommonJsModuleObject &&
          !isGlobalLoaderOwner &&
          !isProcessObject
        ) {
          continue;
        }
        for (const element of declaration.name.elements) {
          const propertyName = element.propertyName;
          const staticPropertyName =
            propertyName === undefined
              ? ts.isIdentifier(element.name)
                ? element.name.text
                : undefined
              : ts.isComputedPropertyName(propertyName)
                ? getLiteralModuleSpecifier(propertyName.expression)
                : propertyName.text;
          if (
            element.dotDotDotToken !== undefined ||
            !ts.isIdentifier(element.name) ||
            (propertyName &&
              ts.isComputedPropertyName(propertyName) &&
              staticPropertyName === undefined)
          ) {
            unresolvedMembers.add(element);
            continue;
          }
          if (
            isModuleNamespace &&
            staticPropertyName === 'createRequire' &&
            !factories.has(element.name.text)
          ) {
            factories.add(element.name.text);
            changed = true;
          } else if (
            isCommonJsModuleObject &&
            staticPropertyName === 'require' &&
            !loaders.has(element.name.text)
          ) {
            loaders.add(element.name.text);
            changed = true;
          } else if (
            isGlobalLoaderOwner &&
            staticPropertyName === 'global' &&
            !globalOwners.has(element.name.text)
          ) {
            globalOwners.add(element.name.text);
            loaderOwners.add(element.name.text);
            changed = true;
          } else if (
            isProcessObject &&
            staticPropertyName === 'getBuiltinModule' &&
            !processBuiltinModuleFactories.has(element.name.text)
          ) {
            processBuiltinModuleFactories.add(element.name.text);
            changed = true;
          }
        }
      }
    }

    const identifierBindings = [
      ...variableDeclarations.flatMap((declaration) =>
        declaration.initializer && ts.isIdentifier(declaration.name)
          ? [
              {
                identifier: declaration.name.text,
                initializer: declaration.initializer,
              },
            ]
          : [],
      ),
      ...assignmentExpressions,
    ];

    for (const {
      identifier,
      initializer: bindingInitializer,
    } of identifierBindings) {
      const initializer = unwrapLoaderBindingExpression(bindingInitializer);
      if (
        isProcessGetBuiltinModuleFactoryExpression(
          initializer,
          processBuiltinModuleFactories,
          processOwners,
          isTrackedProcessNamespaceExpression,
        )
      ) {
        if (!processBuiltinModuleFactories.has(identifier)) {
          processBuiltinModuleFactories.add(identifier);
          changed = true;
        }
        continue;
      }
      const loadedModuleSpecifier = ts.isCallExpression(initializer)
        ? getCommonJsLoadedModuleSpecifier(
            initializer,
            factories,
            loaders,
            loaderOwners,
            moduleNamespaces,
            processBuiltinModuleFactories,
            processOwners,
            isTrackedProcessNamespaceExpression,
          )
        : undefined;
      if (
        isTrackedProcessNamespaceExpression(initializer) ||
        ['node:process', 'process'].includes(loadedModuleSpecifier ?? '')
      ) {
        if (!processOwners.has(identifier)) {
          processOwners.add(identifier);
          changed = true;
        }
        continue;
      }
      if (ts.isIdentifier(initializer) && moduleOwners.has(initializer.text)) {
        if (!moduleOwners.has(identifier)) {
          moduleOwners.add(identifier);
          loaderOwners.add(identifier);
          changed = true;
        }
        continue;
      }
      if (isGlobalLoaderOwnerExpression(initializer)) {
        if (!globalOwners.has(identifier)) {
          globalOwners.add(identifier);
          loaderOwners.add(identifier);
          changed = true;
        }
        continue;
      }
      if (isModuleNamespaceExpression(initializer)) {
        if (!moduleNamespaces.has(identifier)) {
          moduleNamespaces.add(identifier);
          changed = true;
        }
        continue;
      }
      if (isCreateRequireFactoryExpression(initializer)) {
        if (!factories.has(identifier)) {
          factories.add(identifier);
          changed = true;
        }
        continue;
      }
      if (
        isCommonJsLoaderExpression(
          initializer,
          factories,
          loaders,
          loaderOwners,
          moduleNamespaces,
          processBuiltinModuleFactories,
          processOwners,
          isTrackedProcessNamespaceExpression,
        ) &&
        !loaders.has(identifier)
      ) {
        loaders.add(identifier);
        changed = true;
      }
    }
  }

  return {
    factories,
    globalOwners,
    loaders,
    moduleOwners,
    moduleNamespaces,
    processBuiltinModuleFactories,
    processOwners,
    unresolvedMembers,
  };
}

function isCommonJsLoaderExpression(
  node: ts.Expression,
  factories: ReadonlySet<string>,
  loaders: ReadonlySet<string>,
  moduleOwners: ReadonlySet<string>,
  moduleNamespaces: ReadonlySet<string>,
  processBuiltinModuleFactories: ReadonlySet<string>,
  processOwners: ReadonlySet<string>,
  isProcessNamespace?: (node: ts.Expression) => boolean,
): boolean {
  const expression = unwrapLoaderBindingExpression(node);
  if (ts.isIdentifier(expression)) {
    return loaders.has(expression.text);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const target = unwrapModuleSpecifierExpression(expression.expression);
    return (
      (expression.name.text === 'resolve' &&
        ts.isIdentifier(target) &&
        loaders.has(target.text)) ||
      (expression.name.text === 'require' &&
        ts.isIdentifier(target) &&
        (moduleOwners.has(target.text) ||
          ['global', 'globalThis'].includes(target.text)))
    );
  }
  if (ts.isElementAccessExpression(expression)) {
    const propertyName = getStaticPropertyName(expression);
    const target = unwrapModuleSpecifierExpression(expression.expression);
    return (
      (propertyName === 'resolve' &&
        ts.isIdentifier(target) &&
        loaders.has(target.text)) ||
      (propertyName === 'require' &&
        ts.isIdentifier(target) &&
        (moduleOwners.has(target.text) ||
          ['global', 'globalThis'].includes(target.text)))
    );
  }
  if (ts.isCallExpression(expression)) {
    const factoryExpression = unwrapLoaderBindingExpression(
      expression.expression,
    );
    if (ts.isIdentifier(factoryExpression)) {
      return factories.has(factoryExpression.text);
    }
    if (
      (ts.isPropertyAccessExpression(factoryExpression) ||
        ts.isElementAccessExpression(factoryExpression)) &&
      getStaticPropertyName(factoryExpression) === 'createRequire'
    ) {
      const target = unwrapModuleSpecifierExpression(
        factoryExpression.expression,
      );
      if (ts.isIdentifier(target)) {
        return moduleNamespaces.has(target.text);
      }
      if (ts.isCallExpression(target)) {
        const processBuiltinModuleArgument = getProcessBuiltinModuleArgument(
          target,
          processBuiltinModuleFactories,
          processOwners,
          isProcessNamespace,
        );
        if (processBuiltinModuleArgument !== undefined) {
          return (
            processBuiltinModuleArgument !== null &&
            ['node:module', 'module'].includes(
              getLiteralModuleSpecifier(processBuiltinModuleArgument) ?? '',
            )
          );
        }
        const loader = unwrapModuleSpecifierExpression(target.expression);
        const source = target.arguments[0];
        return (
          ts.isIdentifier(loader) &&
          loader.text === 'require' &&
          source !== undefined &&
          ['node:module', 'module'].includes(
            getLiteralModuleSpecifier(source) ?? '',
          )
        );
      }
    }
  }
  return false;
}

function getCommonJsLoadedModuleSpecifier(
  node: ts.CallExpression,
  factories: ReadonlySet<string>,
  loaders: ReadonlySet<string>,
  moduleOwners: ReadonlySet<string>,
  moduleNamespaces: ReadonlySet<string>,
  processBuiltinModuleFactories: ReadonlySet<string>,
  processOwners: ReadonlySet<string>,
  isProcessNamespace?: (node: ts.Expression) => boolean,
): string | undefined {
  const callee = unwrapModuleSpecifierExpression(node.expression);
  if (
    isCommonJsLoaderExpression(
      callee,
      factories,
      loaders,
      moduleOwners,
      moduleNamespaces,
      processBuiltinModuleFactories,
      processOwners,
      isProcessNamespace,
    )
  ) {
    const source = node.arguments[0];
    return source === undefined ? undefined : getLiteralModuleSpecifier(source);
  }
  if (
    !ts.isPropertyAccessExpression(callee) &&
    !ts.isElementAccessExpression(callee)
  ) {
    return undefined;
  }
  const callType = getStaticPropertyName(callee);
  if (
    (callType !== 'call' && callType !== 'apply') ||
    !isCommonJsLoaderExpression(
      callee.expression,
      factories,
      loaders,
      moduleOwners,
      moduleNamespaces,
      processBuiltinModuleFactories,
      processOwners,
      isProcessNamespace,
    )
  ) {
    return undefined;
  }
  if (callType === 'call') {
    const source = node.arguments[1];
    return source === undefined ? undefined : getLiteralModuleSpecifier(source);
  }
  const argumentList = node.arguments[1]
    ? unwrapModuleSpecifierExpression(node.arguments[1])
    : undefined;
  const source =
    argumentList && ts.isArrayLiteralExpression(argumentList)
      ? argumentList.elements[0]
      : undefined;
  return source && ts.isExpression(source)
    ? getLiteralModuleSpecifier(source)
    : undefined;
}

function getRuntimeModuleSpecifiers(
  content: string,
  filePath: string,
  failOnUnresolvedModuleLoad = false,
): RuntimeModuleSpecifier[] {
  const sourceFile = createSourceFile(filePath, content);
  const specifiers: RuntimeModuleSpecifier[] = [];
  const commonJsIdentifiers = getCommonJsLoaderIdentifiers(sourceFile);
  const commonJsLoaderOwners = new Set([
    ...commonJsIdentifiers.globalOwners,
    ...commonJsIdentifiers.moduleOwners,
  ]);

  function throwUnresolvedModuleLoad(node: ts.Node, detail = ''): never {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;
    throw new Error(
      `${filePath}:${line} contains an unresolved executable module load${detail}; use an explicit runtime module specifier.`,
    );
  }

  function addSpecifier(
    moduleSpecifierNode: ts.Node,
    reportNode: ts.Node,
  ): void {
    const specifier = getLiteralModuleSpecifier(moduleSpecifierNode);
    if (specifier !== undefined) {
      specifiers.push({
        specifier,
        start: reportNode.getStart(sourceFile),
      });
    }
  }

  function addCallSpecifier(
    node: ts.CallExpression,
    argument: ts.Expression | undefined = node.arguments[0],
  ): void {
    const specifier =
      argument === undefined ? undefined : getLiteralModuleSpecifier(argument);
    if (specifier !== undefined && argument !== undefined) {
      addSpecifier(argument, node);
      return;
    }
    if (failOnUnresolvedModuleLoad) {
      throwUnresolvedModuleLoad(node);
    }
  }

  function addIndirectLoaderSpecifier(node: ts.CallExpression): boolean {
    const callee = unwrapModuleSpecifierExpression(node.expression);
    if (
      !ts.isPropertyAccessExpression(callee) &&
      !ts.isElementAccessExpression(callee)
    ) {
      return false;
    }

    visitLoaderBindingOperands(callee.expression);
    const callType = getStaticPropertyName(callee);
    if (callType !== 'call' && callType !== 'apply') {
      return false;
    }
    if (
      !isCommonJsLoaderExpression(
        callee.expression,
        commonJsIdentifiers.factories,
        commonJsIdentifiers.loaders,
        commonJsLoaderOwners,
        commonJsIdentifiers.moduleNamespaces,
        commonJsIdentifiers.processBuiltinModuleFactories,
        commonJsIdentifiers.processOwners,
        isTrackedProcessNamespaceExpression,
      )
    ) {
      return false;
    }

    if (callType === 'call') {
      addCallSpecifier(node, node.arguments[1]);
      node.arguments.forEach(visit);
      return true;
    }

    const argumentList = node.arguments[1]
      ? unwrapModuleSpecifierExpression(node.arguments[1])
      : undefined;
    const firstArgument =
      argumentList && ts.isArrayLiteralExpression(argumentList)
        ? argumentList.elements[0]
        : undefined;
    addCallSpecifier(
      node,
      firstArgument && ts.isExpression(firstArgument)
        ? firstArgument
        : undefined,
    );
    node.arguments.forEach(visit);
    return true;
  }

  function visitLoaderBindingOperands(node: ts.Expression): void {
    const expression = unwrapModuleSpecifierExpression(node);
    if (
      ts.isBinaryExpression(expression) &&
      (expression.operatorToken.kind === ts.SyntaxKind.CommaToken ||
        expression.operatorToken.kind === ts.SyntaxKind.EqualsToken)
    ) {
      visit(expression.left);
      visitLoaderBindingOperands(expression.right);
      return;
    }
    if (ts.isCallExpression(expression)) {
      visit(expression);
    }
  }

  function isModuleNamespaceExpression(node: ts.Expression): boolean {
    const expression = unwrapLoaderBindingExpression(node);
    if (ts.isIdentifier(expression)) {
      return commonJsIdentifiers.moduleNamespaces.has(expression.text);
    }
    if (ts.isAwaitExpression(expression)) {
      return isModuleNamespaceExpression(expression.expression);
    }
    if (!ts.isCallExpression(expression)) {
      return false;
    }
    if (
      getProcessBuiltinModuleArgument(
        expression,
        commonJsIdentifiers.processBuiltinModuleFactories,
        commonJsIdentifiers.processOwners,
        isTrackedProcessNamespaceExpression,
      ) !== undefined
    ) {
      return ['node:module', 'module'].includes(
        getProcessBuiltinModuleSpecifier(
          expression,
          commonJsIdentifiers.processBuiltinModuleFactories,
          commonJsIdentifiers.processOwners,
          isTrackedProcessNamespaceExpression,
        ) ?? '',
      );
    }
    if (expression.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const source = expression.arguments[0];
      return (
        source !== undefined &&
        ['node:module', 'module'].includes(
          getLiteralModuleSpecifier(source) ?? '',
        )
      );
    }
    return ['node:module', 'module'].includes(
      getCommonJsLoadedModuleSpecifier(
        expression,
        commonJsIdentifiers.factories,
        commonJsIdentifiers.loaders,
        commonJsLoaderOwners,
        commonJsIdentifiers.moduleNamespaces,
        commonJsIdentifiers.processBuiltinModuleFactories,
        commonJsIdentifiers.processOwners,
        isTrackedProcessNamespaceExpression,
      ) ?? '',
    );
  }

  function isTrackedProcessNamespaceExpression(node: ts.Expression): boolean {
    if (isProcessNamespaceExpression(node, commonJsIdentifiers.processOwners)) {
      return true;
    }
    const expression = unwrapLoaderBindingExpression(node);
    if (ts.isAwaitExpression(expression)) {
      return isTrackedProcessNamespaceExpression(expression.expression);
    }
    const processBuiltinModuleArgument = ts.isCallExpression(expression)
      ? getProcessBuiltinModuleArgument(
          expression,
          commonJsIdentifiers.processBuiltinModuleFactories,
          commonJsIdentifiers.processOwners,
          isTrackedProcessNamespaceExpression,
        )
      : undefined;
    if (processBuiltinModuleArgument !== undefined) {
      return (
        processBuiltinModuleArgument !== null &&
        isProcessModuleSource(processBuiltinModuleArgument)
      );
    }
    return (
      ts.isCallExpression(expression) &&
      ['node:process', 'process'].includes(
        getCommonJsLoadedModuleSpecifier(
          expression,
          commonJsIdentifiers.factories,
          commonJsIdentifiers.loaders,
          commonJsLoaderOwners,
          commonJsIdentifiers.moduleNamespaces,
          commonJsIdentifiers.processBuiltinModuleFactories,
          commonJsIdentifiers.processOwners,
          isTrackedProcessNamespaceExpression,
        ) ?? '',
      )
    );
  }

  function isGlobalLoaderOwnerExpression(node: ts.Expression): boolean {
    const expression = unwrapLoaderBindingExpression(node);
    if (ts.isIdentifier(expression)) {
      return commonJsIdentifiers.globalOwners.has(expression.text);
    }
    return (
      (ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression)) &&
      getStaticPropertyName(expression) === 'global' &&
      isGlobalLoaderOwnerExpression(expression.expression)
    );
  }

  function isDirectTrackedProvenanceExpression(
    expressionNode: ts.Expression,
  ): boolean {
    const expression = unwrapLoaderBindingExpression(expressionNode);
    if (
      isGlobalLoaderOwnerExpression(expression) ||
      isTrackedProcessNamespaceExpression(expression)
    ) {
      return true;
    }
    if (ts.isIdentifier(expression)) {
      return (
        commonJsIdentifiers.factories.has(expression.text) ||
        commonJsIdentifiers.loaders.has(expression.text) ||
        commonJsIdentifiers.moduleOwners.has(expression.text) ||
        commonJsIdentifiers.globalOwners.has(expression.text) ||
        commonJsIdentifiers.moduleNamespaces.has(expression.text) ||
        commonJsIdentifiers.processBuiltinModuleFactories.has(
          expression.text,
        ) ||
        commonJsIdentifiers.processOwners.has(expression.text)
      );
    }
    if (
      isCommonJsLoaderExpression(
        expression,
        commonJsIdentifiers.factories,
        commonJsIdentifiers.loaders,
        commonJsLoaderOwners,
        commonJsIdentifiers.moduleNamespaces,
        commonJsIdentifiers.processBuiltinModuleFactories,
        commonJsIdentifiers.processOwners,
        isTrackedProcessNamespaceExpression,
      ) ||
      isModuleNamespaceExpression(expression) ||
      isProcessGetBuiltinModuleFactoryExpression(
        expression,
        commonJsIdentifiers.processBuiltinModuleFactories,
        commonJsIdentifiers.processOwners,
        isTrackedProcessNamespaceExpression,
      )
    ) {
      return true;
    }
    if (
      (ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression)) &&
      getStaticPropertyName(expression) === 'createRequire'
    ) {
      return isModuleNamespaceExpression(expression.expression);
    }
    return false;
  }

  function containsTrackedProvenance(node: ts.Node): boolean {
    if (ts.isExpression(node) && isDirectTrackedProvenanceExpression(node)) {
      return true;
    }
    if (ts.isCallExpression(node)) {
      return node.arguments.some((argument) =>
        containsTrackedProvenance(argument),
      );
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      if (isTrackedProcessNamespaceExpression(node.expression)) {
        const propertyName = getStaticPropertyName(node);
        return (
          propertyName === undefined ||
          propertyName === 'getBuiltinModule' ||
          propertyName === 'mainModule'
        );
      }
      return containsTrackedProvenance(node.expression);
    }
    if (ts.isPropertyAssignment(node)) {
      return containsTrackedProvenance(node.initializer);
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      return (
        containsTrackedProvenance(node.name) ||
        (node.objectAssignmentInitializer !== undefined &&
          containsTrackedProvenance(node.objectAssignmentInitializer))
      );
    }
    if (ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) {
      return containsTrackedProvenance(node.expression);
    }

    let found = false;
    ts.forEachChild(node, (child) => {
      if (!found && containsTrackedProvenance(child)) {
        found = true;
      }
    });
    return found;
  }

  function isSupportedModuleLoaderBinding(
    declaration: ts.VariableDeclaration,
  ): boolean {
    if (
      !ts.isObjectBindingPattern(declaration.name) ||
      !declaration.initializer
    ) {
      return false;
    }
    const initializer = unwrapModuleSpecifierExpression(
      declaration.initializer,
    );
    const isModuleNamespace = isModuleNamespaceExpression(initializer);
    const isModuleOwner =
      ts.isIdentifier(initializer) &&
      commonJsLoaderOwners.has(initializer.text);
    const isGlobalLoaderOwner = isGlobalLoaderOwnerExpression(initializer);
    const isProcessOwner = isTrackedProcessNamespaceExpression(initializer);
    if (
      !isModuleNamespace &&
      !isModuleOwner &&
      !isGlobalLoaderOwner &&
      !isProcessOwner
    ) {
      return false;
    }
    return declaration.name.elements.every((element) => {
      const propertyName = element.propertyName;
      const staticPropertyName =
        propertyName === undefined
          ? ts.isIdentifier(element.name)
            ? element.name.text
            : undefined
          : ts.isComputedPropertyName(propertyName)
            ? getLiteralModuleSpecifier(propertyName.expression)
            : propertyName.text;
      return (
        element.dotDotDotToken === undefined &&
        ts.isIdentifier(element.name) &&
        staticPropertyName ===
          (isModuleNamespace
            ? 'createRequire'
            : isProcessOwner
              ? 'getBuiltinModule'
              : isGlobalLoaderOwner
                ? 'global'
                : 'require')
      );
    });
  }

  function destructuringCanBindCommonJsLoader(
    pattern: ts.ObjectBindingPattern | ts.ObjectLiteralExpression,
  ): boolean {
    const elements = ts.isObjectBindingPattern(pattern)
      ? pattern.elements
      : pattern.properties;

    return elements.some((element) => {
      if (ts.isBindingElement(element)) {
        if (element.dotDotDotToken !== undefined) {
          return true;
        }
        const propertyName = element.propertyName;
        if (propertyName === undefined) {
          return (
            ts.isIdentifier(element.name) && element.name.text === 'require'
          );
        }
        if (ts.isComputedPropertyName(propertyName)) {
          const staticName = getLiteralModuleSpecifier(propertyName.expression);
          return staticName === undefined || staticName === 'require';
        }
        return propertyName.text === 'require';
      }

      if (ts.isSpreadAssignment(element)) {
        return true;
      }
      const propertyName = element.name;
      if (ts.isComputedPropertyName(propertyName)) {
        const staticName = getLiteralModuleSpecifier(propertyName.expression);
        return staticName === undefined || staticName === 'require';
      }
      return propertyName.text === 'require';
    });
  }

  function isUnsupportedTrackedBinding(node: ts.Node): boolean {
    if (
      ts.isParameter(node) &&
      ts.isObjectBindingPattern(node.name) &&
      destructuringCanBindCommonJsLoader(node.name)
    ) {
      return true;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const target = unwrapModuleSpecifierExpression(node.left);
      const source = unwrapModuleSpecifierExpression(node.right);
      if (
        ts.isObjectLiteralExpression(target) &&
        ts.isIdentifier(source) &&
        commonJsLoaderOwners.has(source.text) &&
        destructuringCanBindCommonJsLoader(target)
      ) {
        return true;
      }
    }
    if (
      ts.isShorthandPropertyAssignment(node) &&
      node.objectAssignmentInitializer !== undefined &&
      containsTrackedProvenance(node.objectAssignmentInitializer)
    ) {
      return true;
    }
    if (
      (ts.isBindingElement(node) ||
        ts.isParameter(node) ||
        ts.isPropertyDeclaration(node)) &&
      node.initializer &&
      containsTrackedProvenance(node.initializer)
    ) {
      return true;
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (!containsTrackedProvenance(node.initializer)) {
        return false;
      }
      if (ts.isIdentifier(node.name)) {
        return !isDirectTrackedProvenanceExpression(node.initializer);
      }
      return !isSupportedModuleLoaderBinding(node);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      containsTrackedProvenance(node.right)
    ) {
      if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
        return true;
      }
      const target = unwrapModuleSpecifierExpression(node.left);
      return (
        !ts.isIdentifier(target) ||
        !isDirectTrackedProvenanceExpression(node.right)
      );
    }
    if (
      (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
      containsTrackedProvenance(node.expression)
    ) {
      return true;
    }
    return false;
  }

  function rejectsExportedLoaderProvenance(node: ts.Node): boolean {
    function isCommonJsExportTarget(expressionNode: ts.Expression): boolean {
      const expression = unwrapModuleSpecifierExpression(expressionNode);
      if (
        !ts.isPropertyAccessExpression(expression) &&
        !ts.isElementAccessExpression(expression)
      ) {
        return false;
      }
      const target = unwrapModuleSpecifierExpression(expression.expression);
      if (ts.isIdentifier(target) && target.text === 'exports') {
        return true;
      }
      if (
        ts.isIdentifier(target) &&
        target.text === 'module' &&
        (getStaticPropertyName(expression) === 'exports' ||
          getStaticPropertyName(expression) === undefined)
      ) {
        return true;
      }
      return isCommonJsExportTarget(target);
    }

    if (ts.isExportDeclaration(node) && isTypeOnlyExportDeclaration(node)) {
      return false;
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ['node:module', 'module'].includes(
        getLiteralModuleSpecifier(node.moduleSpecifier) ?? '',
      )
    ) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        return node.exportClause.elements.some((element) => {
          const exportedName = element.propertyName?.text ?? element.name.text;
          return (
            !element.isTypeOnly &&
            ['createRequire', 'default', 'Module'].includes(exportedName)
          );
        });
      }
      return true;
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      isProcessModuleSource(node.moduleSpecifier)
    ) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        return node.exportClause.elements.some((element) => {
          const exportedName = element.propertyName?.text ?? element.name.text;
          return (
            !element.isTypeOnly &&
            ['getBuiltinModule', 'default'].includes(exportedName)
          );
        });
      }
      return true;
    }

    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      return node.exportClause.elements.some((element) => {
        if (element.isTypeOnly) {
          return false;
        }
        const localName = element.propertyName?.text ?? element.name.text;
        return (
          commonJsIdentifiers.factories.has(localName) ||
          commonJsIdentifiers.loaders.has(localName) ||
          commonJsIdentifiers.moduleOwners.has(localName) ||
          commonJsIdentifiers.globalOwners.has(localName) ||
          commonJsIdentifiers.moduleNamespaces.has(localName) ||
          commonJsIdentifiers.processBuiltinModuleFactories.has(localName) ||
          commonJsIdentifiers.processOwners.has(localName)
        );
      });
    }
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      return node.declarationList.declarations.some(
        (declaration) =>
          (ts.isIdentifier(declaration.name) &&
            (commonJsIdentifiers.factories.has(declaration.name.text) ||
              commonJsIdentifiers.loaders.has(declaration.name.text) ||
              commonJsIdentifiers.moduleOwners.has(declaration.name.text) ||
              commonJsIdentifiers.globalOwners.has(declaration.name.text) ||
              commonJsIdentifiers.processBuiltinModuleFactories.has(
                declaration.name.text,
              ) ||
              commonJsIdentifiers.processOwners.has(declaration.name.text) ||
              commonJsIdentifiers.moduleNamespaces.has(
                declaration.name.text,
              ))) ||
          (declaration.initializer !== undefined &&
            containsTrackedProvenance(declaration.initializer)),
      );
    }
    if (ts.isExportAssignment(node)) {
      return containsTrackedProvenance(node.expression);
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.body &&
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      return containsTrackedProvenance(node.body);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isCommonJsExportTarget(node.left)
    ) {
      return containsTrackedProvenance(node.right);
    }
    return false;
  }

  function visit(node: ts.Node): void {
    if (rejectsExportedLoaderProvenance(node)) {
      if (failOnUnresolvedModuleLoad) {
        throwUnresolvedModuleLoad(
          node,
          ' with exported createRequire loader provenance',
        );
      }
      return;
    }
    if (commonJsIdentifiers.unresolvedMembers.has(node)) {
      if (failOnUnresolvedModuleLoad) {
        throwUnresolvedModuleLoad(node);
      }
      return;
    }
    if (isUnsupportedTrackedBinding(node)) {
      if (failOnUnresolvedModuleLoad) {
        throwUnresolvedModuleLoad(node);
      }
      return;
    }
    if (
      ((ts.isReturnStatement(node) && node.expression) ||
        (ts.isThrowStatement(node) && node.expression) ||
        (ts.isYieldExpression(node) && node.expression)) &&
      containsTrackedProvenance(node.expression)
    ) {
      if (failOnUnresolvedModuleLoad) {
        throwUnresolvedModuleLoad(node);
      }
      return;
    }
    if (
      (ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) &&
      containsTrackedProvenance(node)
    ) {
      if (failOnUnresolvedModuleLoad) {
        throwUnresolvedModuleLoad(node);
      }
      return;
    }
    if (
      ts.isElementAccessExpression(node) &&
      getStaticPropertyName(node) === undefined
    ) {
      const target = unwrapModuleSpecifierExpression(node.expression);
      if (
        isModuleNamespaceExpression(target) ||
        (ts.isIdentifier(target) &&
          (commonJsIdentifiers.moduleOwners.has(target.text) ||
            commonJsIdentifiers.globalOwners.has(target.text) ||
            commonJsIdentifiers.factories.has(target.text) ||
            commonJsIdentifiers.loaders.has(target.text) ||
            commonJsIdentifiers.processBuiltinModuleFactories.has(
              target.text,
            ) ||
            commonJsIdentifiers.processOwners.has(target.text)))
      ) {
        if (failOnUnresolvedModuleLoad) {
          throwUnresolvedModuleLoad(node);
        }
        return;
      }
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const target = unwrapModuleSpecifierExpression(node.expression);
      const propertyName = getStaticPropertyName(node);
      if (
        ['call', 'apply', 'bind'].includes(propertyName ?? '') &&
        containsTrackedProvenance(target)
      ) {
        if (failOnUnresolvedModuleLoad) {
          throwUnresolvedModuleLoad(node);
        }
        return;
      }
    }
    if (ts.isImportTypeNode(node)) {
      return;
    }
    if (ts.isImportDeclaration(node)) {
      if (!isTypeOnlyImportDeclaration(node)) {
        addSpecifier(node.moduleSpecifier, node);
      }
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (!isTypeOnlyExportDeclaration(node) && node.moduleSpecifier) {
        addSpecifier(node.moduleSpecifier, node);
      }
      return;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      addSpecifier(node.moduleReference.expression, node);
      return;
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrapModuleSpecifierExpression(node.expression);
      const loaderBindingCallee = unwrapModuleSpecifierExpression(
        node.expression,
      );
      if (
        ts.isBinaryExpression(loaderBindingCallee) &&
        (loaderBindingCallee.operatorToken.kind === ts.SyntaxKind.CommaToken ||
          loaderBindingCallee.operatorToken.kind === ts.SyntaxKind.EqualsToken)
      ) {
        visit(loaderBindingCallee.left);
        visit(loaderBindingCallee.right);
      } else {
        const unwrappedLoaderBindingCallee =
          unwrapLoaderBindingExpression(loaderBindingCallee);
        if (ts.isCallExpression(unwrappedLoaderBindingCallee)) {
          visit(unwrappedLoaderBindingCallee);
        }
      }
      const processBuiltinModuleArgument = getProcessBuiltinModuleArgument(
        node,
        commonJsIdentifiers.processBuiltinModuleFactories,
        commonJsIdentifiers.processOwners,
        isTrackedProcessNamespaceExpression,
      );
      if (processBuiltinModuleArgument !== undefined) {
        if (
          (processBuiltinModuleArgument === null ||
            getLiteralModuleSpecifier(processBuiltinModuleArgument) ===
              undefined) &&
          failOnUnresolvedModuleLoad
        ) {
          throwUnresolvedModuleLoad(node);
        }
        node.arguments.forEach(visit);
        return;
      }
      if (
        ts.isElementAccessExpression(callee) &&
        getStaticPropertyName(callee) === undefined &&
        ts.isIdentifier(unwrapModuleSpecifierExpression(callee.expression)) &&
        commonJsIdentifiers.moduleNamespaces.has(
          (unwrapModuleSpecifierExpression(callee.expression) as ts.Identifier)
            .text,
        )
      ) {
        if (failOnUnresolvedModuleLoad) {
          throwUnresolvedModuleLoad(node);
        }
        return;
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addCallSpecifier(node);
        node.arguments.forEach(visit);
        return;
      } else if (addIndirectLoaderSpecifier(node)) {
        return;
      } else if (
        isCommonJsLoaderExpression(
          node.expression,
          commonJsIdentifiers.factories,
          commonJsIdentifiers.loaders,
          commonJsLoaderOwners,
          commonJsIdentifiers.moduleNamespaces,
          commonJsIdentifiers.processBuiltinModuleFactories,
          commonJsIdentifiers.processOwners,
          isTrackedProcessNamespaceExpression,
        )
      ) {
        addCallSpecifier(node);
        node.arguments.forEach(visit);
        return;
      } else if (isDirectTrackedProvenanceExpression(node)) {
        node.arguments.forEach(visit);
        if (
          node.arguments.some((argument) => containsTrackedProvenance(argument))
        ) {
          if (failOnUnresolvedModuleLoad) {
            throwUnresolvedModuleLoad(node);
          }
        }
        return;
      } else if (
        containsTrackedProvenance(node.expression) ||
        node.arguments.some((argument) => containsTrackedProvenance(argument))
      ) {
        if (failOnUnresolvedModuleLoad) {
          throwUnresolvedModuleLoad(node);
        }
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function getTypeOnlyModuleRanges(
  content: string,
  filePath: string,
): SourceRange[] {
  const sourceFile = createSourceFile(filePath, content);
  const ranges: SourceRange[] = [];

  function addRange(node: ts.Node): void {
    ranges.push({ start: node.getStart(sourceFile), end: node.getEnd() });
  }

  function visit(node: ts.Node): void {
    if (ts.isImportTypeNode(node)) {
      addRange(node);
      return;
    }
    if (ts.isImportEqualsDeclaration(node) && node.isTypeOnly) {
      addRange(node);
      return;
    }
    if (ts.isImportDeclaration(node)) {
      if (isTypeOnlyImportDeclaration(node)) {
        addRange(node);
        return;
      }
    }
    if (ts.isExportDeclaration(node)) {
      if (isTypeOnlyExportDeclaration(node)) {
        addRange(node);
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return ranges;
}

function isInsideSourceRanges(
  index: number,
  ranges: readonly SourceRange[],
): boolean {
  return ranges.some(({ start, end }) => index >= start && index < end);
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
  const candidateExtension = path.extname(absoluteCandidate);
  const typeScriptExtensionByJavaScriptExtension: Readonly<
    Record<string, readonly string[]>
  > = {
    '.cjs': ['.cts'],
    '.js': ['.ts', '.tsx'],
    '.jsx': ['.tsx'],
    '.mjs': ['.mts'],
  };
  const extensionCandidates = candidateExtension
    ? [
        ...(
          typeScriptExtensionByJavaScriptExtension[candidateExtension] ?? []
        ).map(
          (extension) =>
            `${absoluteCandidate.slice(0, -candidateExtension.length)}${extension}`,
        ),
        absoluteCandidate,
      ]
    : [
        ...runtimeResolutionExtensions.map(
          (extension) => `${absoluteCandidate}${extension}`,
        ),
        ...runtimeResolutionExtensions.map((extension) =>
          path.join(absoluteCandidate, `index${extension}`),
        ),
      ];
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

function getRuntimeCompilerOptions(projectRoot: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists);
  if (configPath === undefined) {
    return {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      `Could not read TypeScript configuration: ${ts.flattenDiagnosticMessageText(config.error.messageText, '\n')}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      `Could not parse TypeScript configuration: ${parsed.errors
        .map((error) =>
          ts.flattenDiagnosticMessageText(error.messageText, '\n'),
        )
        .join('; ')}`,
    );
  }
  return parsed.options;
}

function isLocalRuntimeSpecifier(specifier: string): boolean {
  const normalizedSpecifier = normalizeRelativePath(specifier);
  return (
    normalizedSpecifier.startsWith('./') ||
    normalizedSpecifier.startsWith('../') ||
    normalizedSpecifier.startsWith('/') ||
    normalizedSpecifier.startsWith('@/') ||
    normalizedSpecifier.startsWith('@lib/') ||
    normalizedSpecifier.startsWith('@components/')
  );
}

function getRuntimeImplementationForDeclaration(
  declarationPath: string,
): string | undefined {
  const declarationSuffix = ['.d.mts', '.d.cts', '.d.ts'].find((suffix) =>
    declarationPath.endsWith(suffix),
  );
  if (declarationSuffix === undefined) {
    return declarationPath;
  }

  const basePath = declarationPath.slice(0, -declarationSuffix.length);
  const runtimeExtensions =
    declarationSuffix === '.d.mts'
      ? ['.mjs']
      : declarationSuffix === '.d.cts'
        ? ['.cjs']
        : ['.js', '.jsx', '.mjs', '.cjs'];
  return runtimeExtensions
    .map((extension) => `${basePath}${extension}`)
    .find((candidate) => fs.existsSync(candidate));
}

function resolveRuntimeModuleDependency(
  projectRoot: string,
  importerPath: string,
  specifier: string,
  compilerOptions: ts.CompilerOptions,
): string | undefined {
  const importerAbsolutePath = path.resolve(projectRoot, importerPath);
  const resolvedModule = ts.resolveModuleName(
    specifier,
    importerAbsolutePath,
    compilerOptions,
    ts.sys,
  ).resolvedModule;
  const isLocal = isLocalRuntimeSpecifier(specifier);

  if (resolvedModule === undefined) {
    if (isLocal) {
      throw new Error(
        `${importerPath} contains unresolved local runtime module '${specifier}'.`,
      );
    }
    return undefined;
  }
  if (resolvedModule.isExternalLibraryImport && !isLocal) {
    return undefined;
  }

  const runtimeImplementation = getRuntimeImplementationForDeclaration(
    resolvedModule.resolvedFileName,
  );
  if (runtimeImplementation === undefined) {
    if (isLocal) {
      throw new Error(
        `${importerPath} local runtime module '${specifier}' resolves only to a declaration file.`,
      );
    }
    return undefined;
  }

  const resolvedPath = fs.realpathSync(runtimeImplementation);
  if (
    resolvedPath !== projectRoot &&
    !resolvedPath.startsWith(`${projectRoot}${path.sep}`)
  ) {
    if (isLocal) {
      throw new Error(
        `${importerPath} local runtime module '${specifier}' resolves outside the project.`,
      );
    }
    return undefined;
  }

  return toRelativePath(projectRoot, resolvedPath);
}

/** Derive the transitive project-local runtime module graph for entrypoints. */
export function findRuntimeModuleDependencies(
  options: RuntimeModuleDependencyOptions,
): string[] {
  const projectRoot = fs.realpathSync(options.projectRoot);
  const compilerOptions = getRuntimeCompilerOptions(projectRoot);
  const dependencies = new Set<string>();
  const visited = new Set<string>();

  function visit(relativePath: string): void {
    const absolutePath = path.resolve(projectRoot, relativePath);
    const realPath = fs.realpathSync(absolutePath);
    if (visited.has(realPath)) {
      return;
    }
    visited.add(realPath);

    const content = fs.readFileSync(realPath, 'utf8');
    const importerPath = toRelativePath(projectRoot, realPath);

    for (const { specifier } of getRuntimeModuleSpecifiers(
      content,
      importerPath,
      true,
    )) {
      const dependencyPath = resolveRuntimeModuleDependency(
        projectRoot,
        importerPath,
        specifier,
        compilerOptions,
      );
      if (dependencyPath === undefined) {
        continue;
      }

      dependencies.add(dependencyPath);
      if (isSourceFile(dependencyPath)) {
        visit(dependencyPath);
      }
    }
  }

  for (const entrypoint of options.entrypoints) {
    const absoluteEntrypoint = path.resolve(projectRoot, entrypoint);
    if (
      absoluteEntrypoint !== projectRoot &&
      !absoluteEntrypoint.startsWith(`${projectRoot}${path.sep}`)
    ) {
      throw new Error(
        `Runtime entrypoint '${entrypoint}' is outside the project.`,
      );
    }
    const relativeEntrypoint = path.relative(projectRoot, absoluteEntrypoint);
    let lexicalPath = projectRoot;
    for (const segment of relativeEntrypoint.split(path.sep)) {
      lexicalPath = path.join(lexicalPath, segment);
      if (fs.lstatSync(lexicalPath).isSymbolicLink()) {
        throw new Error(
          `Runtime entrypoint '${entrypoint}' contains a symbolic link.`,
        );
      }
    }
    visit(entrypoint);
  }

  return Array.from(dependencies).sort();
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

  const typeOnlyModuleRanges = getTypeOnlyModuleRanges(content, normalizedPath);

  for (const { specifier, start } of getRuntimeModuleSpecifiers(
    content,
    normalizedPath,
  )) {
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
      addViolation(start);
    }
  }

  function isExecutableCallMatch(matchIndex: number): boolean {
    return (
      !isInsideCommentOrString(content, matchIndex) &&
      !isInsideSourceRanges(matchIndex, typeOnlyModuleRanges)
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

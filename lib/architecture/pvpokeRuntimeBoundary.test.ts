import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertNoPvpokeVendorRuntimeDependency,
  findPvpokeVendorRuntimeDependencies,
} from './pvpokeRuntimeBoundary';

const projectRoot = path.resolve(__dirname, '../..');

describe('PvPoke runtime dependency boundary', () => {
  it('rejects runtime imports or loads of PvPoke vendor JavaScript', () => {
    const violations = findPvpokeVendorRuntimeDependencies({
      projectRoot,
      runtimeRoots: [
        'app',
        'components',
        'lib',
        'middleware.ts',
        'instrumentation.ts',
      ],
      excludedRuntimeSubtrees: ['lib/sync', 'lib/scripts'],
      virtualFiles: new Map([
        [
          'lib/genetic/fitness/badBoundary.ts',
          "import TeamRanker from '@/vendor/pvpoke/src/js/battle/rankers/TeamRanker.js';",
        ],
        [
          'app/api/bad-route.ts',
          "await import('../../vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'components/bad-component.tsx',
          "import '@/vendor/pvpoke/src/js/battle/Battle.js';",
        ],
        [
          'lib/genetic/fitness/badReExport.ts',
          "export * from '@/vendor/pvpoke/src/js/battle/Battle.js';",
        ],
        [
          'lib/genetic/fitness/badRequireResolve.ts',
          "const battleModule = require.resolve('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badRequireResolveOptional.ts',
          "const battleModule = require.resolve?.('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badRequireResolveCall.ts',
          "const battleModule = require.resolve.call(null, '@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badRequireResolveApply.ts',
          "const battleModule = require.resolve.apply(null, ['@/vendor/pvpoke/src/js/battle/Battle.js']);",
        ],
        [
          'lib/genetic/fitness/badRequireOptionalCall.ts',
          "require?.('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badRequireDotCall.ts',
          "require.call(null, '@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badRequireResolveRelativeSync.ts',
          "const syncModule = require.resolve('../../sync/adapter');",
        ],
        [
          'lib/genetic/fitness/badRequireResolveSync.ts',
          "const syncModule = require.resolve('@/lib/sync/adapter');",
        ],
        [
          'lib/genetic/fitness/badRequireResolveVariable.ts',
          "const battlePath = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js');\nconst battleModule = require.resolve(battlePath);",
        ],
        [
          'lib/genetic/fitness/badExtensionless.ts',
          "const Battle = require('@/vendor/pvpoke/src/js/battle/Battle');",
        ],
        [
          'lib/genetic/fitness/badConstructedLoad.ts',
          "fs.readFileSync(path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badConstructedLoadSplitInline.ts',
          "const vendorDir = 'vendor';\nconst pvpokeDir = 'pvpoke';\nfs.readFileSync(path.join(projectRoot, vendorDir, pvpokeDir, 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badConstructedImport.ts',
          "await import(path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badConstructedImportSplitInline.ts',
          "const vendorDir = 'vendor';\nconst pvpokeDir = 'pvpoke';\nawait import(path.join(projectRoot, vendorDir, pvpokeDir, 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badConstructedImportSplitFragments.ts',
          "const vendorDir = 'ven' + 'dor';\nconst pvpokeDir = 'pv' + 'poke';\nawait import(path.join(projectRoot, vendorDir, pvpokeDir, 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badConstructedPvpokeSrcImport.ts',
          "await import(path.join(projectRoot, 'pvpoke', 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badConstructedRequire.ts',
          "const Battle = require(path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badConstructedRequireExtensionless.ts',
          "const root = '@/vendor';\nconst pkg = 'pvpoke';\nconst target = 'src/js/battle/Battle';\nrequire(`${root}/${pkg}/${target}`);",
        ],
        [
          'lib/genetic/fitness/badConstructedRequireSplitInline.ts',
          "const vendorDir = 'vendor';\nconst pvpokeDir = 'pvpoke';\nconst Battle = require(path.join(projectRoot, vendorDir, pvpokeDir, 'src', 'js', 'battle', 'Battle.js'));",
        ],
        [
          'lib/genetic/fitness/badCtsRequire.cts',
          "const Battle = require('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badBackslashRequire.ts',
          String.raw`const Battle = require('..\\..\\vendor\\pvpoke\\src\\js\\battle\\Battle');`,
        ],
        [
          'lib/genetic/fitness/badAliasRequire.ts',
          "const runtimeRequire = createRequire(import.meta.url);\nruntimeRequire('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badBarePvpokeImport.ts',
          "import pvpoke from 'pvpoke';",
        ],
        [
          'lib/genetic/fitness/badBarePvpokeRequire.ts',
          "const pvpoke = require('pvpoke');",
        ],
        [
          'lib/genetic/fitness/badBarePvpokeSubpathRequire.ts',
          "const pvpoke = require('pvpoke/battle');",
        ],
        [
          'lib/genetic/fitness/badCommonJsFsLoaderAlias.ts',
          "const { readFileSync: loadVendorJs } = require('node:fs');\nloadVendorJs('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badCommonJsCreateRequireAlias.ts',
          "const { createRequire: cr } = require('node:module');\nconst runtimeRequire = cr(import.meta.url);\nruntimeRequire('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badAliasFileLoad.ts',
          "const loadVendorJs = fs.readFileSync;\nloadVendorJs('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badAliasRequireResolve.ts',
          "const runtimeRequire = createRequire(import.meta.url);\nruntimeRequire.resolve('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badAliasRequireResolveFunction.ts',
          "const runtimeRequire = createRequire(import.meta.url);\nconst resolveVendor = runtimeRequire.resolve;\nresolveVendor('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badAliasRequireResolveOptional.ts',
          "const runtimeRequire = createRequire(import.meta.url);\nruntimeRequire.resolve?.('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badAliasVariableRequire.ts',
          "const runtimeRequire = createRequire(import.meta.url);\nconst battlePath = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js');\nruntimeRequire(battlePath);",
        ],
        [
          'lib/genetic/fitness/badAssignedCreateRequireFactoryAlias.ts',
          "const makeRequire = createRequire;\nconst runtimeRequire = makeRequire(import.meta.url);\nruntimeRequire('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badAliasSyncRequire.ts',
          "const runtimeRequire = createRequire(import.meta.url);\nconst syncPath = '@/lib/sync/adapter';\nruntimeRequire(syncPath);",
        ],
        [
          'lib/genetic/fitness/badVariableImport.ts',
          "const battlePath = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js');\nawait import(pathToFileURL(battlePath).href);",
        ],
        [
          'lib/genetic/fitness/badVariableLoad.ts',
          "const battlePath = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js');\nfs.readFileSync(battlePath);",
        ],
        [
          'lib/genetic/fitness/badVariableLoadNoSemicolon.ts',
          "const battlePath = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js')\nfs.readFileSync(battlePath)",
        ],
        [
          'lib/genetic/fitness/badVariableLoadMultiline.ts',
          "const battlePath = path.join(\n  projectRoot,\n  'vendor',\n  'pvpoke',\n  'src',\n  'js',\n  'battle',\n  'Battle.js',\n);\nfs.readFileSync(battlePath);",
        ],
        [
          'lib/genetic/fitness/badVariableLoadDollarIdentifier.ts',
          "const battle$Path = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js');\nfs.readFileSync(battle$Path);",
        ],
        [
          'lib/genetic/fitness/badVariableLoadDollarBoundary.ts',
          "const $battlePath = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js');\nfs.readFileSync($battlePath);",
        ],
        [
          'lib/genetic/fitness/badDerivedVariableLoad.ts',
          "const vendorRoot = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js');\nconst battlePath = path.join(vendorRoot, 'battle', 'Battle.js');\nfs.readFileSync(battlePath);",
        ],
        [
          'lib/genetic/fitness/badSplitVariableLoad.ts',
          "const vendorDir = 'vendor';\nconst pvpokeDir = 'pvpoke';\nconst battlePath = path.join(projectRoot, vendorDir, pvpokeDir, 'src', 'js', 'battle', 'Battle.js');\nfs.readFileSync(battlePath);",
        ],
        [
          'lib/genetic/fitness/badEmbeddedVendorRoot.ts',
          "const vendorRoot = '@/vendor';\nconst packageName = 'pvpoke';\nconst battlePath = path.join(vendorRoot, packageName, 'src', 'js', 'battle', 'Battle.js');\nfs.readFileSync(battlePath);",
        ],
        [
          'lib/genetic/fitness/badMtsImport.mts',
          "import Battle from '@/vendor/pvpoke/src/js/battle/Battle.js';",
        ],
        [
          'lib/genetic/fitness/badLibAliasSyncImport.ts',
          "import { createPvpokeSyncAdapter } from '@lib/sync/adapter';",
        ],
        [
          'lib/genetic/fitness/badSyncImport.ts',
          "import { createPvpokeSyncAdapter } from '@/lib/sync/adapter';",
        ],
        [
          'lib/genetic/fitness/badUnicodeEscapedRequire.ts',
          String.raw`const Battle = require('..\u002f..\u002fvendor\u002fpvpoke\u002fsrc\u002fjs\u002fbattle\u002fBattle.js');`,
        ],
        [
          'lib/genetic/fitness/badUnicodeStaticImport.ts',
          String.raw`import Battle from '..\u002f..\u002fvendor\u002fpvpoke\u002fsrc\u002fjs\u002fbattle\u002fBattle.js';`,
        ],
        [
          'lib/genetic/fitness/badUnicodeTokenRequire.ts',
          String.raw`const Battle = require('@/\u0076endor/\u0070vpoke/src/js/battle/Battle.js');`,
        ],
        [
          'lib/genetic/fitness/badUnicodeCodePointRequire.ts',
          String.raw`const Battle = require('@/\u{76}endor/\u{70}vpoke/src/js/battle/Battle.js');`,
        ],
        [
          'lib/genetic/fitness/badDynamicSyncImport.ts',
          "const syncPath = '@/lib/sync/adapter';\nawait import(syncPath);",
        ],
        [
          'lib/genetic/fitness/badDotSegmentAliasSyncImport.ts',
          "import { createPvpokeSyncAdapter } from '@/lib/genetic/../sync/adapter';",
        ],
        [
          'lib/genetic/fitness/badDotSegmentAbsoluteSyncImport.ts',
          "await import('/lib/genetic/../sync/adapter');",
        ],
        [
          'lib/genetic/fitness/badAbsoluteProjectSyncImport.ts',
          `await import('${projectRoot}/lib/sync/adapter');`,
        ],
        [
          'lib/genetic/fitness/badAbsoluteTraversalSyncImport.ts',
          `await import('${projectRoot}/../${path.basename(projectRoot)}/lib/sync/adapter');`,
        ],
        [
          'lib/genetic/fitness/badRelativeSyncImport.ts',
          "const syncPath = '../../sync/adapter';\nawait import(syncPath);",
        ],
        [
          'lib/genetic/fitness/badSplitSyncImport.ts',
          "const root = '@/lib';\nconst area = 'sync';\nawait import(`${root}/${area}/adapter`);",
        ],
        [
          'lib/genetic/fitness/badBracketLoad.ts',
          "fs['readFileSync']('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badBracketAliasFileLoad.ts',
          "const loadVendorJs = fs['readFileSync'];\nloadVendorJs('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badBracketAliasRequire.ts',
          "const runtimeRequire = globalThis['require'];\nruntimeRequire('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badBracketVariableRequire.ts',
          "const battlePath = path.join(projectRoot, 'vendor', 'pvpoke', 'src', 'js', 'battle', 'Battle.js');\nglobalThis['require'](battlePath);",
        ],
        [
          'lib/genetic/fitness/badOptionalBracketRequire.ts',
          "globalThis?.['require']?.('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badOptionalBracketFileLoad.ts',
          "fs?.['readFileSync']?.('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badBracketSyncRequire.ts',
          "globalThis['require']('@/lib/sync/adapter');",
        ],
        [
          'lib/genetic/fitness/badBracketResolveSync.ts',
          "require['resolve']('@/lib/sync/adapter');",
        ],
        [
          'lib/genetic/fitness/badConstructedSyncImport.ts',
          "await import('@/lib/' + 'sync/adapter');",
        ],
        [
          'lib/genetic/fitness/badCommentSeparatedImport.ts',
          "await import /* boundary */ ('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badLineCommentSeparatedImport.ts',
          "await import // boundary\n('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badCommentSeparatedRequire.ts',
          "const Battle = require /* boundary */ ('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badLineCommentSeparatedRequire.ts',
          "const Battle = require // boundary\n('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badCommentSeparatedRequireResolve.ts',
          "const battleModule = require.resolve /* boundary */ ('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badLineCommentSeparatedRequireResolve.ts',
          "const battleModule = require.resolve // boundary\n('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badTemplateInterpolatedSpecifier.ts',
          "await import(`@/vendor/${'pvpoke'}/src/js/battle/Battle.js`);",
        ],
        [
          'lib/genetic/fitness/badTemplateImport.ts',
          "const loaded = `${await import('@/vendor/pvpoke/src/js/battle/Battle.js')}`;",
        ],
        [
          'lib/genetic/fitness/badTemplateRequire.ts',
          "const loaded = `${require('@/vendor/pvpoke/src/js/battle/Battle.js')}`;",
        ],
        [
          'lib/genetic/fitness/badInlineCreateRequire.ts',
          "createRequire(import.meta.url)('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badInlineCreateRequireResolve.ts',
          "createRequire(import.meta.url).resolve('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badIndirectCreateRequire.ts',
          "(0, createRequire)(import.meta.url)('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badIndirectCreateRequireResolve.ts',
          "(0, createRequire)(import.meta.url).resolve('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badInlineImportedCreateRequireAlias.ts',
          "import { createRequire as cr } from 'node:module';\ncr(import.meta.url)('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badInlineImportedCreateRequireAliasResolve.ts',
          "import { createRequire as cr } from 'node:module';\ncr(import.meta.url).resolve('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badImportedCreateRequireAlias.ts',
          "import { createRequire as cr } from 'node:module';\nconst runtimeRequire = cr(import.meta.url);\nruntimeRequire('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badImportedFsLoaderAlias.ts',
          "import { readFileSync as loadVendorJs } from 'node:fs';\nloadVendorJs('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/badImportedFsPromisesLoaderAlias.ts',
          "import { readFile as loadVendorJs } from 'node:fs/promises';\nawait loadVendorJs('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
      ]),
    });

    expect(violations).toEqual([
      {
        path: 'app/api/bad-route.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'components/bad-component.tsx',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAbsoluteProjectSyncImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAbsoluteTraversalSyncImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAliasFileLoad.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAliasRequire.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAliasRequireResolve.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAliasRequireResolveFunction.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAliasRequireResolveOptional.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAliasSyncRequire.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAliasVariableRequire.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badAssignedCreateRequireFactoryAlias.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBackslashRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBarePvpokeImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBarePvpokeRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBarePvpokeSubpathRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBoundary.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBracketAliasFileLoad.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBracketAliasRequire.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBracketLoad.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBracketResolveSync.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBracketSyncRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badBracketVariableRequire.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badCommentSeparatedImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badCommentSeparatedRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badCommentSeparatedRequireResolve.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badCommonJsCreateRequireAlias.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badCommonJsFsLoaderAlias.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedImportSplitFragments.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedImportSplitInline.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedLoad.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedLoadSplitInline.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedPvpokeSrcImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedRequireExtensionless.ts',
        line: 4,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedRequireSplitInline.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badConstructedSyncImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badCtsRequire.cts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badDerivedVariableLoad.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badDotSegmentAbsoluteSyncImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badDotSegmentAliasSyncImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badDynamicSyncImport.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badEmbeddedVendorRoot.ts',
        line: 4,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badExtensionless.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badImportedCreateRequireAlias.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badImportedFsLoaderAlias.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badImportedFsPromisesLoaderAlias.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badIndirectCreateRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badIndirectCreateRequireResolve.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badInlineCreateRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badInlineCreateRequireResolve.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badInlineImportedCreateRequireAlias.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badInlineImportedCreateRequireAliasResolve.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badLibAliasSyncImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badLineCommentSeparatedImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badLineCommentSeparatedRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badLineCommentSeparatedRequireResolve.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badMtsImport.mts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badOptionalBracketFileLoad.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badOptionalBracketRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badReExport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRelativeSyncImport.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireDotCall.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireOptionalCall.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireResolve.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireResolveApply.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireResolveCall.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireResolveOptional.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireResolveRelativeSync.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireResolveSync.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badRequireResolveVariable.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badSplitSyncImport.ts',
        line: 3,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badSplitVariableLoad.ts',
        line: 4,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badSyncImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badTemplateImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badTemplateInterpolatedSpecifier.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badTemplateRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badUnicodeCodePointRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badUnicodeEscapedRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badUnicodeStaticImport.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badUnicodeTokenRequire.ts',
        line: 1,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badVariableImport.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badVariableLoad.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badVariableLoadDollarBoundary.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badVariableLoadDollarIdentifier.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badVariableLoadMultiline.ts',
        line: 10,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
      {
        path: 'lib/genetic/fitness/badVariableLoadNoSemicolon.ts',
        line: 2,
        reason: 'imports or loads PvPoke vendor JavaScript',
      },
    ]);
  });

  it('discovers .mts and .cts source files from runtime roots', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.pvpoke-boundary-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'badModule.mts'),
        "import Battle from '@/vendor/pvpoke/src/js/battle/Battle.js';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'badCommon.cts'),
        "const Battle = require('@/vendor/pvpoke/src/js/battle/Battle.js');",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'badLinkedSource.fixture'),
        "const Battle = require('@/vendor/pvpoke/src/js/battle/Battle.js');",
      );
      fs.mkdirSync(path.join(fixtureRoot, 'vendor/pvpoke/src/js/battle'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(fixtureRoot, 'vendor/pvpoke/src/js/battle/Battle.js'),
        'export default class Battle {}',
      );
      fs.symlinkSync(
        path.join(fixtureRoot, 'vendor/pvpoke/src/js'),
        path.join(fixtureRoot, 'pvpokeEngine'),
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'badSymlinkImport.ts'),
        "import Battle from './pvpokeEngine/battle/Battle.js';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'badSymlinkLoad.ts'),
        "fs.readFileSync('./pvpokeEngine/battle/Battle.js');",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'badSymlinkVariableLoad.ts'),
        "const battlePath = './pvpokeEngine/battle/Battle.js';\nfs.readFileSync(battlePath);",
      );
      fs.symlinkSync(
        path.join(fixtureRoot, 'badLinkedSource.fixture'),
        path.join(fixtureRoot, 'linkedSource.ts'),
      );

      expect(
        findPvpokeVendorRuntimeDependencies({
          projectRoot,
          runtimeRoots: [path.relative(projectRoot, fixtureRoot)],
          excludedRuntimeSubtrees: ['lib/sync', 'lib/scripts'],
        }),
      ).toEqual([
        {
          path: `${path.basename(fixtureRoot)}/badCommon.cts`,
          line: 1,
          reason: 'imports or loads PvPoke vendor JavaScript',
        },
        {
          path: `${path.basename(fixtureRoot)}/badModule.mts`,
          line: 1,
          reason: 'imports or loads PvPoke vendor JavaScript',
        },
        {
          path: `${path.basename(fixtureRoot)}/badSymlinkImport.ts`,
          line: 1,
          reason: 'imports or loads PvPoke vendor JavaScript',
        },
        {
          path: `${path.basename(fixtureRoot)}/badSymlinkLoad.ts`,
          line: 1,
          reason: 'imports or loads PvPoke vendor JavaScript',
        },
        {
          path: `${path.basename(fixtureRoot)}/badSymlinkVariableLoad.ts`,
          line: 2,
          reason: 'imports or loads PvPoke vendor JavaScript',
        },
        {
          path: `${path.basename(fixtureRoot)}/linkedSource.ts`,
          line: 1,
          reason: 'imports or loads PvPoke vendor JavaScript',
        },
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('allows repository-owned runtime TypeScript to use PvPoke-derived data vocabulary', () => {
    const violations = findPvpokeVendorRuntimeDependencies({
      projectRoot,
      runtimeRoots: ['lib'],
      excludedRuntimeSubtrees: ['lib/sync', 'lib/scripts'],
      virtualFiles: new Map([
        [
          'lib/genetic/fitness/roleScoring.ts',
          "const label = 'uses PvPoke consistency ranking data when available';",
        ],
        [
          'lib/genetic/fitness/runtimeBoundaryMessage.ts',
          "throw new Error('Do not import @/vendor/pvpoke/src/js at runtime');",
        ],
        [
          'lib/genetic/fitness/commentedVendorImport.ts',
          "// import Battle from '@/vendor/pvpoke/src/js/battle/Battle.js';",
        ],
        [
          'lib/genetic/fitness/commentedVendorRequire.ts',
          "// require('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/stringifiedVendorRequire.ts',
          'const message = "Do not require(\'@/vendor/pvpoke/src/js/battle/Battle.js\') at runtime";',
        ],
        [
          'lib/genetic/fitness/vendorTypeOnly.ts',
          "import type Battle from '@/vendor/pvpoke/src/js/battle/Battle.js';",
        ],
        [
          'lib/genetic/fitness/vendorNamedTypeOnly.ts',
          "import { type Battle } from '@/vendor/pvpoke/src/js/battle/Battle.js';",
        ],
        [
          'lib/genetic/fitness/vendorNamedExportTypeOnly.ts',
          "export { type Battle } from '@/vendor/pvpoke/src/js/battle/Battle.js';",
        ],
        [
          'lib/genetic/fitness/vendorTypeofImport.ts',
          "type BattleCtor = typeof import('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
        [
          'lib/genetic/fitness/safeSyncVocabularyPath.ts',
          "await import('@/lib/genetic/sync/adapter');",
        ],
        [
          'lib/genetic/fitness/safeConstructedSyncVocabularyPath.ts',
          "await import(path.join('@/lib', 'genetic', 'sync', 'adapter'));",
        ],
        [
          'lib/genetic/fitness/safeBracketResolve.ts',
          "config['resolve']('@/lib/sync/adapter');",
        ],
        [
          'lib/genetic/fitness/safeBracketPush.ts',
          "labels['push']('lib', 'sync');",
        ],
        [
          'lib/genetic/fitness/safeMetadataReadFile.ts',
          "metadata['readFile']('@/vendor/pvpoke/src/js/battle/Battle.js');",
        ],
      ]),
    });

    expect(violations).toEqual([]);
  });

  it('keeps app, component, and runtime optimizer code free of PvPoke vendor JavaScript dependencies', () => {
    expect(() => {
      assertNoPvpokeVendorRuntimeDependency({
        projectRoot,
        runtimeRoots: [
          'app',
          'components',
          'lib',
          'middleware.ts',
          'instrumentation.ts',
        ],
        excludedRuntimeSubtrees: ['lib/sync', 'lib/scripts'],
      });
    }).not.toThrow();
  });
});

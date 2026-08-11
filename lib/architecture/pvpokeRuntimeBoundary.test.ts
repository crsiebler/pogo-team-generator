import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertNoPvpokeVendorRuntimeDependency,
  findRuntimeModuleDependencies,
  findPvpokeVendorRuntimeDependencies,
  isTeamDetailsRuntimeAuthorityDependencyAllowed,
} from './pvpokeRuntimeBoundary';
import { loadRuntimeFunctionAssetPlan } from '@/lib/build/runtimeFunctionAssets';

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

  it('ignores erased Node module imports and exports in runtime graphs', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-type-only-module-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        [
          "import type nodeModule from 'node:module';",
          "import { type createRequire as CreateRequireType } from 'module';",
          "import { createRequire as RuntimeFactory } from 'node:module';",
          "export type { createRequire } from 'node:module';",
          "export { type createRequire, builtinModules } from 'node:module';",
          'export type Factory = CreateRequireType;',
          'export type Namespace = typeof nodeModule;',
          'const runtimeValue = 1;',
          'export { type RuntimeFactory, runtimeValue };',
        ].join('\n'),
      );

      expect(
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toEqual([]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('keeps team-details authority validation inside repository-owned runtime boundaries', () => {
    const teamDetailsAssets = new Set(
      loadRuntimeFunctionAssetPlan().teamDetails,
    );
    const dependencies = [
      ...findRuntimeModuleDependencies({
        projectRoot,
        entrypoints: ['app/api/team-details/route.ts'],
      }),
      ...teamDetailsAssets,
    ];

    expect(dependencies).toEqual(
      expect.arrayContaining([
        'lib/data/moves.ts',
        'lib/data/pokemon.ts',
        'lib/data/rankings.ts',
        'lib/data/runtimeSimulationRepository.ts',
        'lib/data/runtimeSimulationSnapshotFile.ts',
        'lib/data/simulations.ts',
        'lib/genetic/moveset.ts',
      ]),
    );
    expect(dependencies).not.toContain('lib/coverage/typeChart.ts');
    expect(dependencies).not.toContain('data/type-effectiveness.json');
    expect(
      dependencies.filter(
        (dependency) =>
          !isTeamDetailsRuntimeAuthorityDependencyAllowed(
            dependency,
            teamDetailsAssets,
          ),
      ),
    ).toEqual([]);
    expect(
      [
        'lib/sync/simulations.ts',
        'lib/scripts/sync.ts',
        'lib/data/movesetVariantSimulations.ts',
        'lib/data/runtimeSimulationAssetIndex.ts',
        'vendor/pvpoke/src/js/battle/Battle.js',
        'data/simulations/cp1500/all/moveset-variants.json',
        'data/simulations/cp1500/all/azumarill_0-0.csv',
        'data/simulations/runtime-asset-index.json',
        'data/rankings/cp1500/all/leads_rankings.csv',
        'data/rankings/cp9999/not-a-cup/overall_rankings.csv',
        'data/simulations/cp9999/not-a-cup/runtime-snapshot.json',
        'fixtures/azumarill_0-0.csv',
        'fixtures/moveset-variants.json',
        'fixtures/runtime-asset-index.json',
        'fixtures/runtime-snapshot.json',
        'fixtures/INACTIVE_0-0.CSV',
        'fixtures/Runtime-Snapshot.json',
        'fixtures/moves.json',
        'fixtures/pokemon.json',
        'fixtures/type-effectiveness.json',
        'data/../../lib/sync/adapter.ts',
        '/data/moves.json',
        String.raw`C:\data\moves.json`,
        '../lib/sync/adapter.ts',
      ].filter((dependency) =>
        isTeamDetailsRuntimeAuthorityDependencyAllowed(
          dependency,
          teamDetailsAssets,
        ),
      ),
    ).toEqual([]);
  });

  it('discovers executable TypeScript imports across supported specifier forms', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-dependency-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        [
          "type TypeOnly = typeof import('./typeOnly.js');",
          "type DirectTypeOnly = import('./directTypeOnly.js').Value;",
          "import type ImportEqualsOnly = require('./importEqualsTypeOnly.js');",
          "const loaded = typeof import('./valueImport.js');",
          "const objectValue = { loaded: typeof import('./objectValueImport.js') };",
          'void loaded;',
          'void objectValue;',
          'void import(`./templateImport.js`);',
          "void import('./collision.js');",
          "void import('./extensionlessCollision');",
          'void import(`./dollar$Import`);',
          "import './quoted\\'Import';",
          "import directBeforeIndex from './directBeforeIndex';",
          "import './compilerCollision';",
          "const assertedRequire = require('./assertedRequire.js' as const);",
          "const parenthesizedRequire = require(('./parenthesizedRequire.js'));",
          "const resolvedRequire = require.resolve('./resolvedRequire.js');",
          "const moduleRequire = module.require('./moduleRequire.js');",
          'const runtimeRequire = createRequire(import.meta.url);',
          "const createdRequire = runtimeRequire('./createdRequire.js');",
          "const inlineCreatedRequire = createRequire(import.meta.url)('./inlineCreatedRequire.js');",
          "import mixedDefault, { type MixedType } from './mixedImport.js';",
          'void mixedDefault;',
          'void assertedRequire;',
          'void parenthesizedRequire;',
          'void resolvedRequire;',
          'void moduleRequire;',
          'void createdRequire;',
          'void inlineCreatedRequire;',
          'const mixedType: MixedType | undefined = undefined;',
          'void mixedType;',
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'valueImport.ts'),
        "import './transitive.js';",
      );
      fs.writeFileSync(path.join(fixtureRoot, 'transitive.ts'), 'export {};');
      fs.writeFileSync(
        path.join(fixtureRoot, 'templateImport.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'objectValueImport.ts'),
        "import './objectValueTransitive.js';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'objectValueTransitive.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'mixedImport.ts'),
        "import './mixedImportTransitive.js';\nexport default {};\nexport interface MixedType {}",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'mixedImportTransitive.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'collision.ts'),
        "import './collisionTransitive.js';",
      );
      fs.writeFileSync(path.join(fixtureRoot, 'collision.js'), 'export {};');
      fs.writeFileSync(
        path.join(fixtureRoot, 'collisionTransitive.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'extensionlessCollision.ts'),
        "import './extensionlessCollisionTransitive.js';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'extensionlessCollision.js'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'extensionlessCollisionTransitive.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'dollar$Import.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, "quoted'Import.ts"),
        'export {};',
      );
      fs.mkdirSync(path.join(fixtureRoot, 'directBeforeIndex'));
      fs.writeFileSync(
        path.join(fixtureRoot, 'directBeforeIndex.tsx'),
        "import './directBeforeIndexTransitive.js';\nexport default {};",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'directBeforeIndex/index.ts'),
        'export default {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'directBeforeIndexTransitive.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'compilerCollision.mts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'compilerCollision.js'),
        "import './compilerCollisionTransitive.js';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'compilerCollisionTransitive.ts'),
        'export {};',
      );
      for (const moduleName of [
        'assertedRequire',
        'parenthesizedRequire',
        'resolvedRequire',
        'moduleRequire',
        'createdRequire',
        'inlineCreatedRequire',
      ]) {
        fs.writeFileSync(
          path.join(fixtureRoot, `${moduleName}.ts`),
          'export {};',
        );
      }
      fs.writeFileSync(
        path.join(fixtureRoot, 'typeOnly.ts'),
        "import './typeOnlyTransitive.js';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'typeOnlyTransitive.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'directTypeOnly.ts'),
        "import './directTypeOnlyTransitive.js';\nexport interface Value {}",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'directTypeOnlyTransitive.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'importEqualsTypeOnly.ts'),
        "import './importEqualsTypeOnlyTransitive.js';\nexport = {};",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'importEqualsTypeOnlyTransitive.ts'),
        'export {};',
      );

      expect(
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toEqual([
        'assertedRequire.ts',
        'collision.ts',
        'collisionTransitive.ts',
        'compilerCollision.js',
        'compilerCollisionTransitive.ts',
        'createdRequire.ts',
        'directBeforeIndex.tsx',
        'directBeforeIndexTransitive.ts',
        'dollar$Import.ts',
        'extensionlessCollision.ts',
        'extensionlessCollisionTransitive.ts',
        'inlineCreatedRequire.ts',
        'mixedImport.ts',
        'mixedImportTransitive.ts',
        'moduleRequire.ts',
        'objectValueImport.ts',
        'objectValueTransitive.ts',
        'parenthesizedRequire.ts',
        "quoted'Import.ts",
        'resolvedRequire.ts',
        'templateImport.ts',
        'transitive.ts',
        'valueImport.ts',
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('follows createRequire factories from every supported module binding', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-create-require-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        [
          "import * as nodeModule from 'node:module';",
          "import { createRequire as importedFactory } from 'module';",
          "import { default as defaultModule, Module as moduleClass } from 'node:module';",
          "import importedEqualsModule = require('node:module');",
          "const commonJsModule = require('node:module');",
          "const { createRequire: destructuredFactory } = require('module');",
          'const { createRequire: namespaceFactory } = nodeModule;',
          "const { ['createRequire']: computedPropertyFactory } = nodeModule;",
          'const memberFactory = commonJsModule.createRequire;',
          'const namespaceRequire = nodeModule.createRequire(import.meta.url);',
          'const importedRequire = importedFactory(import.meta.url);',
          'const defaultModuleRequire = defaultModule.createRequire(import.meta.url);',
          'const moduleClassRequire = moduleClass.createRequire(import.meta.url);',
          'const importedEqualsRequire = importedEqualsModule.createRequire(import.meta.url);',
          'const commonJsRequire = commonJsModule.createRequire(import.meta.url);',
          'const destructuredRequire = destructuredFactory(import.meta.url);',
          'const namespaceFactoryRequire = namespaceFactory(import.meta.url);',
          'const computedPropertyRequire = computedPropertyFactory(import.meta.url);',
          'const memberFactoryRequire = memberFactory(import.meta.url);',
          "const directCommonJsRequire = require('module').createRequire(import.meta.url);",
          'let reassignedFactory;',
          'reassignedFactory = nodeModule.createRequire;',
          'let reassignedRequire;',
          'reassignedRequire = reassignedFactory(import.meta.url);',
          'const moduleRequireAlias = module.require;',
          'const { require: destructuredModuleRequire } = module;',
          "const { ['require']: computedModuleRequire } = module;",
          'const moduleOwnerAlias = module;',
          'const moduleOwnerRequire = moduleOwnerAlias.require;',
          'const { require: destructuredOwnerRequire } = moduleOwnerAlias;',
          "const globalThisRequire = globalThis['require'];",
          'const globalRequire = global.require;',
          'const nestedGlobalOwner = globalThis.global;',
          'const { global: destructuredGlobalOwner } = globalThis;',
          'const nestedGlobalRequire = nestedGlobalOwner.require;',
          'const destructuredGlobalRequire = destructuredGlobalOwner.require;',
          'const indirectRequire = (0, importedFactory)(import.meta.url);',
          'const requireAlias = require;',
          "const aliasedModule = requireAlias('node:module');",
          'const aliasedNamespaceRequire = aliasedModule.createRequire(import.meta.url);',
          "const requiredModule = module.require('module');",
          'const moduleRequireNamespaceRequire = requiredModule.createRequire(import.meta.url);',
          "const importedModule = await import('node:module');",
          'const importedNamespaceRequire = importedModule.createRequire(import.meta.url);',
          "const processModule = process.getBuiltinModule('node:module');",
          'const processModuleRequire = processModule.createRequire(import.meta.url);',
          "const inlineProcessRequire = process.getBuiltinModule('module').createRequire(import.meta.url);",
          'const builtinModuleFactory = process.getBuiltinModule;',
          "const aliasedProcessModule = builtinModuleFactory('node:module');",
          'const aliasedProcessRequire = aliasedProcessModule.createRequire(import.meta.url);',
          'const { getBuiltinModule: destructuredBuiltinModuleFactory } = process;',
          "const destructuredProcessModule = destructuredBuiltinModuleFactory('module');",
          'const destructuredProcessRequire = destructuredProcessModule.createRequire(import.meta.url);',
          "const calledProcessModule = process.getBuiltinModule.call(process, 'node:module');",
          'const calledProcessRequire = calledProcessModule.createRequire(import.meta.url);',
          "const appliedProcessModule = builtinModuleFactory.apply(process, ['module']);",
          'const appliedProcessRequire = appliedProcessModule.createRequire(import.meta.url);',
          "const calledModule = require.call(undefined, 'node:module');",
          'const calledNamespaceRequire = calledModule.createRequire(import.meta.url);',
          "const appliedModule = module.require.apply(undefined, ['module']);",
          'const appliedNamespaceRequire = appliedModule.createRequire(import.meta.url);',
          'let outerFactory;',
          'let innerFactory;',
          'outerFactory = innerFactory = nodeModule.createRequire;',
          'let outerRequire;',
          'let innerRequire;',
          'outerRequire = innerRequire = outerFactory(import.meta.url);',
          "void namespaceRequire('./namespaceRuntime.js');",
          "void importedRequire('./importedRuntime.js');",
          "void defaultModuleRequire('./defaultModuleRuntime.js');",
          "void moduleClassRequire('./moduleClassRuntime.js');",
          "void importedEqualsRequire('./importedEqualsRuntime.js');",
          "void commonJsRequire('./commonJsRuntime.js');",
          "void destructuredRequire('./destructuredRuntime.js');",
          "void namespaceFactoryRequire('./namespaceFactoryRuntime.js');",
          "void computedPropertyRequire('./computedPropertyRuntime.js');",
          "void memberFactoryRequire('./memberFactoryRuntime.js');",
          "void directCommonJsRequire('./directCommonJsRuntime.js');",
          "void reassignedRequire('./reassignedRuntime.js');",
          "void moduleRequireAlias('./moduleRequireAliasRuntime.js');",
          "void destructuredModuleRequire('./destructuredModuleRuntime.js');",
          "void computedModuleRequire('./computedModuleRuntime.js');",
          "void moduleOwnerRequire('./moduleOwnerRuntime.js');",
          "void destructuredOwnerRequire('./destructuredOwnerRuntime.js');",
          "void globalThisRequire('./globalThisRuntime.js');",
          "void globalRequire('./globalRuntime.js');",
          "void nestedGlobalRequire('./nestedGlobalRuntime.js');",
          "void destructuredGlobalRequire('./destructuredGlobalRuntime.js');",
          "void indirectRequire('./indirectRuntime.js');",
          "void aliasedNamespaceRequire('./aliasedNamespaceRuntime.js');",
          "void moduleRequireNamespaceRequire('./moduleRequireNamespaceRuntime.js');",
          "void importedNamespaceRequire('./importedNamespaceRuntime.js');",
          "void processModuleRequire('./processModuleRuntime.js');",
          "void inlineProcessRequire('./inlineProcessRuntime.js');",
          "void aliasedProcessRequire('./aliasedProcessRuntime.js');",
          "void destructuredProcessRequire('./destructuredProcessRuntime.js');",
          "void calledProcessRequire('./calledProcessRuntime.js');",
          "void appliedProcessRequire('./appliedProcessRuntime.js');",
          "void calledNamespaceRequire('./calledNamespaceRuntime.js');",
          "void appliedNamespaceRequire('./appliedNamespaceRuntime.js');",
          "void outerRequire('./chainedRuntime.js');",
          "void outerRequire.call(undefined, './calledRuntime.js');",
          "void outerRequire.apply(undefined, ['./appliedRuntime.js']);",
        ].join('\n'),
      );
      for (const moduleName of [
        'aliasedNamespaceRuntime',
        'aliasedProcessRuntime',
        'appliedProcessRuntime',
        'appliedNamespaceRuntime',
        'commonJsRuntime',
        'computedModuleRuntime',
        'destructuredOwnerRuntime',
        'destructuredProcessRuntime',
        'calledNamespaceRuntime',
        'chainedRuntime',
        'calledRuntime',
        'defaultModuleRuntime',
        'destructuredRuntime',
        'destructuredGlobalRuntime',
        'destructuredModuleRuntime',
        'directCommonJsRuntime',
        'computedPropertyRuntime',
        'importedEqualsRuntime',
        'importedNamespaceRuntime',
        'importedRuntime',
        'inlineProcessRuntime',
        'indirectRuntime',
        'globalRuntime',
        'globalThisRuntime',
        'memberFactoryRuntime',
        'moduleClassRuntime',
        'moduleRequireAliasRuntime',
        'moduleRequireNamespaceRuntime',
        'moduleOwnerRuntime',
        'namespaceFactoryRuntime',
        'namespaceRuntime',
        'nestedGlobalRuntime',
        'processModuleRuntime',
        'calledProcessRuntime',
        'reassignedRuntime',
        'appliedRuntime',
      ]) {
        fs.writeFileSync(
          path.join(fixtureRoot, `${moduleName}.ts`),
          'export {};',
        );
      }

      expect(
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toEqual([
        'aliasedNamespaceRuntime.ts',
        'aliasedProcessRuntime.ts',
        'appliedNamespaceRuntime.ts',
        'appliedProcessRuntime.ts',
        'appliedRuntime.ts',
        'calledNamespaceRuntime.ts',
        'calledProcessRuntime.ts',
        'calledRuntime.ts',
        'chainedRuntime.ts',
        'commonJsRuntime.ts',
        'computedModuleRuntime.ts',
        'computedPropertyRuntime.ts',
        'defaultModuleRuntime.ts',
        'destructuredGlobalRuntime.ts',
        'destructuredModuleRuntime.ts',
        'destructuredOwnerRuntime.ts',
        'destructuredProcessRuntime.ts',
        'destructuredRuntime.ts',
        'directCommonJsRuntime.ts',
        'globalRuntime.ts',
        'globalThisRuntime.ts',
        'importedEqualsRuntime.ts',
        'importedNamespaceRuntime.ts',
        'importedRuntime.ts',
        'indirectRuntime.ts',
        'inlineProcessRuntime.ts',
        'memberFactoryRuntime.ts',
        'moduleClassRuntime.ts',
        'moduleOwnerRuntime.ts',
        'moduleRequireAliasRuntime.ts',
        'moduleRequireNamespaceRuntime.ts',
        'namespaceFactoryRuntime.ts',
        'namespaceRuntime.ts',
        'nestedGlobalRuntime.ts',
        'processModuleRuntime.ts',
        'reassignedRuntime.ts',
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('follows getBuiltinModule through supported process bindings', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-process-module-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        [
          "import processDefault from 'node:process';",
          "import * as processNamespace from 'process';",
          "import { getBuiltinModule as importedBuiltinFactory } from 'node:process';",
          "import processEquals = require('process');",
          'const processAlias = process;',
          "const requiredProcess = require('node:process');",
          "const { getBuiltinModule: requiredBuiltinFactory } = require('process');",
          "const dynamicProcess = await import('node:process');",
          "const builtinProcess = process.getBuiltinModule('node:process');",
          'const runtimeLoader = require;',
          "const moduleRequiredProcess = module.require('node:process');",
          "const calledProcess = runtimeLoader.call(undefined, 'process');",
          "const appliedProcess = runtimeLoader.apply(undefined, ['node:process']);",
          "const { getBuiltinModule: moduleRequiredBuiltinFactory } = module.require('process');",
          "const aliasModule = processAlias.getBuiltinModule('module');",
          "const defaultModule = processDefault.getBuiltinModule('node:module');",
          "const namespaceModule = processNamespace.getBuiltinModule('module');",
          "const importedModule = importedBuiltinFactory('node:module');",
          "const equalsModule = processEquals.getBuiltinModule('module');",
          "const requiredModule = requiredProcess.getBuiltinModule('node:module');",
          "const destructuredModule = requiredBuiltinFactory('module');",
          "const dynamicModule = dynamicProcess.getBuiltinModule('node:module');",
          "const builtinProcessModule = builtinProcess.getBuiltinModule('module');",
          "const inlineBuiltinProcessModule = process.getBuiltinModule('process').getBuiltinModule('node:module');",
          "const moduleRequiredModule = moduleRequiredProcess.getBuiltinModule('module');",
          "const calledModule = calledProcess.getBuiltinModule('node:module');",
          "const appliedModule = appliedProcess.getBuiltinModule('module');",
          "const moduleDestructuredModule = moduleRequiredBuiltinFactory('node:module');",
          "const inlineLoaderModule = runtimeLoader('process').getBuiltinModule('module');",
          "void aliasModule.createRequire(import.meta.url)('./aliasRuntime.js');",
          "void defaultModule.createRequire(import.meta.url)('./defaultRuntime.js');",
          "void namespaceModule.createRequire(import.meta.url)('./namespaceRuntime.js');",
          "void importedModule.createRequire(import.meta.url)('./importedRuntime.js');",
          "void equalsModule.createRequire(import.meta.url)('./equalsRuntime.js');",
          "void requiredModule.createRequire(import.meta.url)('./requiredRuntime.js');",
          "void destructuredModule.createRequire(import.meta.url)('./destructuredRuntime.js');",
          "void dynamicModule.createRequire(import.meta.url)('./dynamicRuntime.js');",
          "void builtinProcessModule.createRequire(import.meta.url)('./builtinProcessRuntime.js');",
          "void inlineBuiltinProcessModule.createRequire(import.meta.url)('./inlineBuiltinProcessRuntime.js');",
          "void moduleRequiredModule.createRequire(import.meta.url)('./moduleRequiredRuntime.js');",
          "void calledModule.createRequire(import.meta.url)('./calledRuntime.js');",
          "void appliedModule.createRequire(import.meta.url)('./appliedRuntime.js');",
          "void moduleDestructuredModule.createRequire(import.meta.url)('./moduleDestructuredRuntime.js');",
          "void inlineLoaderModule.createRequire(import.meta.url)('./inlineLoaderRuntime.js');",
        ].join('\n'),
      );
      for (const moduleName of [
        'aliasRuntime',
        'appliedRuntime',
        'calledRuntime',
        'builtinProcessRuntime',
        'defaultRuntime',
        'destructuredRuntime',
        'dynamicRuntime',
        'equalsRuntime',
        'importedRuntime',
        'inlineBuiltinProcessRuntime',
        'inlineLoaderRuntime',
        'moduleDestructuredRuntime',
        'moduleRequiredRuntime',
        'namespaceRuntime',
        'requiredRuntime',
      ]) {
        fs.writeFileSync(
          path.join(fixtureRoot, `${moduleName}.ts`),
          'export {};',
        );
      }

      expect(
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toEqual([
        'aliasRuntime.ts',
        'appliedRuntime.ts',
        'builtinProcessRuntime.ts',
        'calledRuntime.ts',
        'defaultRuntime.ts',
        'destructuredRuntime.ts',
        'dynamicRuntime.ts',
        'equalsRuntime.ts',
        'importedRuntime.ts',
        'inlineBuiltinProcessRuntime.ts',
        'inlineLoaderRuntime.ts',
        'moduleDestructuredRuntime.ts',
        'moduleRequiredRuntime.ts',
        'namespaceRuntime.ts',
        'requiredRuntime.ts',
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('follows fully inline recursive process namespace loaders', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-inline-process-loader-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        [
          "void process.getBuiltinModule('process').getBuiltinModule('module').createRequire(import.meta.url)('./directRuntime.js');",
          "void process.getBuiltinModule('node:process').getBuiltinModule.call(process, 'node:module').createRequire(import.meta.url)('./calledRuntime.js');",
          "void process.getBuiltinModule('process').getBuiltinModule.apply(process, ['module']).createRequire(import.meta.url)('./appliedRuntime.js');",
        ].join('\n'),
      );
      for (const moduleName of [
        'appliedRuntime',
        'calledRuntime',
        'directRuntime',
      ]) {
        fs.writeFileSync(
          path.join(fixtureRoot, `${moduleName}.ts`),
          'export {};',
        );
      }

      expect(
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toEqual(['appliedRuntime.ts', 'calledRuntime.ts', 'directRuntime.ts']);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('traverses executable loads inside loader-factory arguments', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-dependency-factory-argument-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        [
          "void createRequire(require('./authorityBase'))('./runtime.js');",
          "void (0, createRequire(require('./sequenceBase')))('node:fs');",
          'let runtimeRequire;',
          "void (runtimeRequire = createRequire(require('./assignmentBase')))('node:path');",
          "void (require('./discardedCallReceiver'), runtimeRequire).call(undefined, 'node:fs');",
          'let applyReceiver;',
          "void (applyReceiver = require('./assignedApplyReceiver'), runtimeRequire).apply(undefined, ['node:path']);",
        ].join('\n'),
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'authorityBase.ts'),
        'export {};',
      );
      fs.writeFileSync(path.join(fixtureRoot, 'runtime.js'), 'export {};');
      fs.writeFileSync(path.join(fixtureRoot, 'sequenceBase.ts'), 'export {};');
      fs.writeFileSync(
        path.join(fixtureRoot, 'assignmentBase.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'discardedCallReceiver.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'assignedApplyReceiver.ts'),
        'export {};',
      );

      expect(
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toEqual([
        'assignedApplyReceiver.ts',
        'assignmentBase.ts',
        'authorityBase.ts',
        'discardedCallReceiver.ts',
        'runtime.js',
        'sequenceBase.ts',
      ]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('excludes external packages consistently across install layouts', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-dependency-package-layout-fixture-'),
    );

    try {
      const workspaceProject = path.join(fixtureRoot, 'workspace/project');
      const projects = [path.join(fixtureRoot, 'local'), workspaceProject];
      const packageRoots = [
        path.join(projects[0], 'node_modules/runtime-package'),
        path.join(fixtureRoot, 'workspace/node_modules/runtime-package'),
      ];
      for (const currentProject of projects) {
        fs.mkdirSync(currentProject, { recursive: true });
        fs.writeFileSync(
          path.join(currentProject, 'entry.ts'),
          "import 'runtime-package';",
        );
      }
      for (const packageRoot of packageRoots) {
        fs.mkdirSync(packageRoot, { recursive: true });
        fs.writeFileSync(
          path.join(packageRoot, 'package.json'),
          JSON.stringify({ name: 'runtime-package', main: 'index.js' }),
        );
        fs.writeFileSync(
          path.join(packageRoot, 'index.js'),
          "import './transitive.js';",
        );
        fs.writeFileSync(path.join(packageRoot, 'transitive.js'), 'export {};');
      }

      expect(
        projects.map((currentProject) =>
          findRuntimeModuleDependencies({
            projectRoot: currentProject,
            entrypoints: ['entry.ts'],
          }),
        ),
      ).toEqual([[], []]);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('follows runtime JavaScript instead of declaration-only resolutions', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-declaration-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        "import './runtimeAuthority';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'runtimeAuthority.d.ts'),
        'export {};',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'runtimeAuthority.js'),
        "import './transitiveRuntime.js';",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'transitiveRuntime.ts'),
        'export {};',
      );

      expect(
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toEqual(['runtimeAuthority.js', 'transitiveRuntime.ts']);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it.each([
    {
      name: 'template with a computed prefix',
      source: "const prefix = './';\nvoid import(`${prefix}runtime.js`);",
    },
    {
      name: 'concatenated specifier',
      source:
        "const moduleName = 'runtime';\nvoid import('./' + moduleName + '.js');",
    },
    {
      name: 'variable specifier',
      source:
        "const moduleSpecifier = './runtime.js';\nvoid import(moduleSpecifier);",
    },
    {
      name: 'template with import options',
      source:
        "const moduleName = 'runtime';\nvoid import(`./${moduleName}.json`, { with: { type: 'json' } });",
    },
    {
      name: 'computed require',
      source:
        "const moduleName = 'runtime';\nvoid require('./' + moduleName + '.js');",
    },
    {
      name: 'computed require.resolve',
      source:
        "const moduleName = 'runtime';\nvoid require.resolve('./' + moduleName + '.js');",
    },
    {
      name: 'computed createRequire alias',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst moduleName = 'runtime';\nvoid runtimeRequire('./' + moduleName + '.js');",
    },
    {
      name: 'computed reassigned createRequire alias',
      source:
        "import * as nodeModule from 'node:module';\nlet factory;\nfactory = nodeModule.createRequire;\nlet runtimeRequire;\nruntimeRequire = factory(import.meta.url);\nconst moduleName = 'runtime';\nvoid runtimeRequire('./' + moduleName + '.js');",
    },
    {
      name: 'computed chained createRequire alias',
      source:
        "import * as nodeModule from 'node:module';\nlet outerFactory;\nlet innerFactory;\nouterFactory = innerFactory = nodeModule.createRequire;\nlet outerRequire;\nlet innerRequire;\nouterRequire = innerRequire = outerFactory(import.meta.url);\nconst moduleName = 'runtime';\nvoid outerRequire('./' + moduleName + '.js');",
    },
    {
      name: 'computed call loader argument',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst moduleName = 'runtime';\nvoid runtimeRequire.call(undefined, './' + moduleName + '.js');",
    },
    {
      name: 'computed apply loader argument',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst moduleName = 'runtime';\nvoid runtimeRequire.apply(undefined, ['./' + moduleName + '.js']);",
    },
    {
      name: 'computed nested direct loader argument',
      source:
        "const moduleName = 'runtime';\nvoid require('node:fs', require('./' + moduleName + '.js'));",
    },
    {
      name: 'computed nested call loader argument',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst moduleName = 'runtime';\nvoid runtimeRequire.call(require('./' + moduleName + '.js'), 'node:fs');",
    },
    {
      name: 'computed nested apply loader argument',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst moduleName = 'runtime';\nvoid runtimeRequire.apply(undefined, ['node:fs', require('./' + moduleName + '.js')]);",
    },
    {
      name: 'computed nested loader-factory argument',
      source:
        "const moduleName = 'runtime';\nvoid createRequire(require('./' + moduleName + '.js'))('node:fs');",
    },
    {
      name: 'computed process builtin module lookup',
      source:
        "const moduleName = 'module';\nconst nodeModule = process.getBuiltinModule(moduleName);\nvoid nodeModule.createRequire(import.meta.url)('./runtime.js');",
    },
    {
      name: 'computed inline process builtin module member',
      source:
        "const memberName = 'createRequire';\nvoid process.getBuiltinModule('module')[memberName];",
    },
    {
      name: 'computed load in a discarded loader sequence operand',
      source:
        "const moduleName = 'runtime';\nvoid (import('./' + moduleName + '.js'), require)('node:fs');",
    },
    {
      name: 'computed load in a loader assignment target',
      source:
        "const moduleName = 'runtime';\nconst target = {};\nvoid (target[require('./' + moduleName + '.js')] = createRequire(import.meta.url))('node:fs');",
    },
    {
      name: 'computed globalThis require access',
      source:
        "const memberName = 'require';\nvoid globalThis[memberName]('node:fs');",
    },
    {
      name: 'computed global require access',
      source:
        "const memberName = 'require';\nvoid global[memberName]('node:fs');",
    },
    {
      name: 'computed aliased global require access',
      source:
        "const runtimeGlobal = globalThis;\nconst memberName = 'require';\nvoid runtimeGlobal[memberName]('node:fs');",
    },
    {
      name: 'computed createRequire member',
      source:
        "import * as nodeModule from 'node:module';\nconst memberName = 'create' + 'Require';\nconst runtimeRequire = nodeModule[memberName](import.meta.url);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'computed createRequire member alias',
      source:
        "import * as nodeModule from 'node:module';\nconst memberName = 'create' + 'Require';\nconst runtimeFactory = nodeModule[memberName];\nconst runtimeRequire = runtimeFactory(import.meta.url);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'computed loader member alias',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst memberName = 'resolve';\nconst resolveRuntime = runtimeRequire[memberName];\nvoid resolveRuntime('./runtime.js');",
    },
    {
      name: 'computed loader call member',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst memberName = 'call';\nvoid runtimeRequire[memberName](undefined, './runtime.js');",
    },
    {
      name: 'computed loader apply member',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst memberName = 'apply';\nvoid runtimeRequire[memberName](undefined, ['./runtime.js']);",
    },
    {
      name: 'computed createRequire destructuring',
      source:
        "import * as nodeModule from 'node:module';\nconst memberName = 'create' + 'Require';\nconst { [memberName]: runtimeFactory } = nodeModule;\nconst runtimeRequire = runtimeFactory(import.meta.url);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'computed module loader invocation',
      source:
        "const memberName = 'require';\nvoid module[memberName]('./runtime.js');",
    },
    {
      name: 'computed module loader alias',
      source:
        "const memberName = 'require';\nconst runtimeRequire = module[memberName];\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'computed aliased module loader invocation',
      source:
        "const moduleOwner = module;\nconst memberName = 'require';\nvoid moduleOwner[memberName]('./runtime.js');",
    },
    {
      name: 'computed aliased module loader destructuring',
      source:
        "const moduleOwner = module;\nconst memberName = 'require';\nconst { [memberName]: runtimeRequire } = moduleOwner;\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'computed global require alias load',
      source:
        "const runtimeRequire = globalThis['require'];\nconst moduleName = 'runtime';\nvoid runtimeRequire('./' + moduleName + '.js');",
    },
    {
      name: 'createRequire call indirection',
      source:
        "const runtimeRequire = createRequire.call(undefined, import.meta.url);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'createRequire apply indirection',
      source:
        "const runtimeRequire = createRequire.apply(undefined, [import.meta.url]);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'createRequire bind indirection',
      source:
        "const runtimeFactory = createRequire.bind(undefined);\nconst runtimeRequire = runtimeFactory(import.meta.url);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'loader bind indirection',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst boundRequire = runtimeRequire.bind(undefined);\nvoid boundRequire('./runtime.js');",
    },
    {
      name: 'destructured tracked loader',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst { resolve: resolveRuntime } = runtimeRequire;\nvoid resolveRuntime('./runtime.js');",
    },
    {
      name: 'nested destructured tracked loader container',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst { nested: { loadRuntime } } = { nested: { loadRuntime: runtimeRequire } };\nvoid loadRuntime('./runtime.js');",
    },
    {
      name: 'rest destructured tracked module namespace',
      source:
        "import * as nodeModule from 'node:module';\nconst { ...moduleMembers } = nodeModule;\nvoid moduleMembers.createRequire(import.meta.url)('./runtime.js');",
    },
    {
      name: 'array-contained tracked loader',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst [loadRuntime] = [runtimeRequire];\nvoid loadRuntime('./runtime.js');",
    },
    {
      name: 'object-contained tracked factory',
      source:
        "const runtimeFactories = { create: createRequire };\nconst runtimeRequire = runtimeFactories.create(import.meta.url);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'nested createRequire call indirection',
      source:
        "import * as nodeModule from 'node:module';\nconst runtimeRequire = nodeModule.createRequire.call(undefined, import.meta.url);\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'nested loader resolve bind indirection',
      source:
        "const runtimeRequire = createRequire(import.meta.url);\nconst resolveRuntime = runtimeRequire.resolve.bind(runtimeRequire);\nvoid resolveRuntime('./runtime.js');",
    },
    {
      name: 'loader returned from a helper function',
      source:
        "function getRuntimeRequire() { return createRequire(import.meta.url); }\nconst runtimeRequire = getRuntimeRequire();\nvoid runtimeRequire('./runtime.js');",
    },
    {
      name: 'loader yielded from a helper generator',
      source:
        'function* getRuntimeRequire() { yield createRequire(import.meta.url); }\nvoid getRuntimeRequire();',
    },
    {
      name: 'direct aggregate loader invocation',
      source: "void ({ load: require }).load('./runtime.js');",
    },
    {
      name: 'tracked loader passed to a direct wrapper',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nvoid consume(runtimeRequire);',
    },
    {
      name: 'tracked loader passed to a constructor',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nvoid new RuntimeLoader(runtimeRequire);',
    },
    {
      name: 'tracked loader passed through a tagged template',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nvoid runtimeTag`${runtimeRequire}`;',
    },
    {
      name: 'tracked loader in a class property initializer',
      source:
        "class RuntimeLoader { runtimeRequire = require; }\nvoid new RuntimeLoader().runtimeRequire('./runtime.js');",
    },
    {
      name: 'tracked loader in a parameter initializer',
      source:
        "function load(runtimeRequire = require) { runtimeRequire('./runtime.js'); }\nload();",
    },
    {
      name: 'tracked loader in a binding default',
      source:
        "const [runtimeRequire = require] = [];\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'tracked loader in a shorthand assignment default',
      source:
        "let runtimeRequire;\n({ runtimeRequire = require } = {});\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'tracked loader in a computed assignment default',
      source:
        "let runtimeRequire;\nconst memberName = 'runtimeRequire';\n({ [memberName]: runtimeRequire = require } = {});\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'module loader in a destructuring assignment',
      source:
        "let runtimeRequire;\n({ require: runtimeRequire } = module);\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'module loader in a computed destructuring assignment',
      source:
        "let runtimeRequire;\n({ ['require']: runtimeRequire } = module);\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'computed module member in a destructuring assignment',
      source:
        "let runtimeRequire;\nconst memberName = 'require';\n({ [memberName]: runtimeRequire } = module);\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'module loader in a destructured parameter default',
      source:
        "function load({ require: runtimeRequire } = module) { runtimeRequire('./runtime.js'); }\nload();",
    },
    {
      name: 'module loader in a computed destructured parameter default',
      source:
        "function load({ ['require']: runtimeRequire } = module) { runtimeRequire('./runtime.js'); }\nload();",
    },
    {
      name: 'module loader passed to a destructured parameter',
      source:
        "function load({ require: runtimeRequire }) { runtimeRequire('./runtime.js'); }\nload(module);",
    },
    {
      name: 'computed module member in a destructured parameter default',
      source:
        "const memberName = 'require';\nfunction load({ [memberName]: runtimeRequire } = module) { runtimeRequire('./runtime.js'); }\nload();",
    },
    {
      name: 'tracked loader in a compound assignment',
      source:
        "let runtimeRequire;\nruntimeRequire ??= require;\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'tracked loader in a loop binding',
      source:
        "for (const runtimeRequire of [require]) { runtimeRequire('./runtime.js'); }",
    },
    {
      name: 'global loader owner in an aggregate',
      source:
        'const runtimeGlobals = { owner: globalThis };\nvoid runtimeGlobals;',
    },
    {
      name: 'global loader owner passed to a wrapper',
      source: 'void consume(globalThis);',
    },
    {
      name: 'global loader owner returned from a helper',
      source:
        'function getRuntimeGlobal() { return globalThis; }\nvoid getRuntimeGlobal();',
    },
    {
      name: 'global loader owner in an unsupported assignment',
      source: 'const target = {};\ntarget.owner = globalThis;',
    },
    {
      name: 'tracked loader thrown across a catch boundary',
      source:
        "let runtimeRequire;\ntry { throw require; } catch (caught) { runtimeRequire = caught; }\nruntimeRequire('./runtime.js');",
    },
    {
      name: 'process mainModule loader provenance',
      source: "process.mainModule.require('./runtime.js');",
    },
  ])('rejects unresolved executable module load: $name', ({ source }) => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-dependency-template-fixture-'),
    );

    try {
      fs.writeFileSync(path.join(fixtureRoot, 'entry.ts'), source);

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/entry\.ts.*unresolved.*module/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects exported createRequire provenance that cannot be followed across modules', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-exported-loader-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        "import { runtimeFactory } from './factory.js';\nconst runtimeRequire = runtimeFactory(import.meta.url);\nruntimeRequire('./runtime.js');",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'factory.ts'),
        "export { createRequire as runtimeFactory } from 'node:module';",
      );
      fs.writeFileSync(path.join(fixtureRoot, 'runtime.ts'), 'export {};');

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/factory\.ts.*exported.*createRequire.*provenance/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects exported getBuiltinModule provenance that cannot be followed across modules', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-exported-builtin-loader-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        "import { builtinFactory } from './factory.js';\nconst nodeModule = builtinFactory('node:module');\nnodeModule.createRequire(import.meta.url)('./runtime.js');",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'factory.ts'),
        'const builtinFactory = process.getBuiltinModule;\nexport { builtinFactory };',
      );
      fs.writeFileSync(path.join(fixtureRoot, 'runtime.ts'), 'export {};');

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/factory\.ts.*exported.*loader provenance/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects exported CommonJS process namespace provenance across modules', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-exported-process-namespace-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        "import { runtimeProcess } from './factory.js';\nconst nodeModule = runtimeProcess.getBuiltinModule('node:module');\nnodeModule.createRequire(import.meta.url)('./runtime.js');",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'factory.ts'),
        "const runtimeProcess = module.require('node:process');\nexport { runtimeProcess };",
      );
      fs.writeFileSync(path.join(fixtureRoot, 'runtime.ts'), 'export {};');

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/factory\.ts.*exported.*loader provenance/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects exported builtin process namespace provenance across modules', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-exported-builtin-process-fixture-'),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        "import { runtimeProcess } from './factory.js';\nconst nodeModule = runtimeProcess.getBuiltinModule('node:module');\nnodeModule.createRequire(import.meta.url)('./runtime.js');",
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'factory.ts'),
        "const runtimeProcess = process.getBuiltinModule('node:process');\nexport { runtimeProcess };",
      );
      fs.writeFileSync(path.join(fixtureRoot, 'runtime.ts'), 'export {};');

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/factory\.ts.*exported.*loader provenance/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it.each([
    {
      name: 'default export',
      source:
        "import { createRequire as runtimeFactory } from 'node:module';\nexport default runtimeFactory;",
    },
    {
      name: 'export equals',
      source:
        "import { createRequire as runtimeFactory } from 'node:module';\nexport = runtimeFactory;",
    },
    {
      name: 'module exports assignment',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nmodule.exports = runtimeRequire;',
    },
    {
      name: 'exports property assignment',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nexports.runtimeRequire = runtimeRequire;',
    },
    {
      name: 'nested module exports assignment',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nmodule.exports.runtimeRequire = runtimeRequire;',
    },
    {
      name: 'direct CommonJS factory assignment',
      source: "module.exports = require('node:module').createRequire;",
    },
    {
      name: 'module namespace default export',
      source:
        "import * as nodeModule from 'node:module';\nexport default nodeModule;",
    },
    {
      name: 'import-equals namespace export',
      source:
        "import nodeModule = require('node:module');\nmodule.exports.nodeModule = nodeModule;",
    },
    {
      name: 'named module namespace export',
      source:
        "import * as nodeModule from 'node:module';\nexport { nodeModule };",
    },
    {
      name: 'mixed named module namespace re-export',
      source:
        "export { type createRequire, default as nodeModule } from 'node:module';",
    },
    {
      name: 'default nested aggregate export',
      source:
        "import { createRequire as runtimeFactory } from 'node:module';\nexport default { runtime: { factory: runtimeFactory } };",
    },
    {
      name: 'export-equals aggregate loader export',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nexport = [{ runtimeRequire }];',
    },
    {
      name: 'exported aggregate variable',
      source:
        "import { createRequire as runtimeFactory } from 'node:module';\nexport const runtime = { factory: runtimeFactory };",
    },
    {
      name: 'nested CommonJS aggregate export',
      source:
        'const runtimeRequire = createRequire(import.meta.url);\nmodule.exports = { nested: { runtimeRequire } };',
    },
    {
      name: 'spread CommonJS aggregate export',
      source:
        "import * as nodeModule from 'node:module';\nexports.runtime = { ...{ nodeModule } };",
    },
    {
      name: 'named function returning a loader',
      source:
        'export function getRuntimeRequire() { return createRequire(import.meta.url); }',
    },
  ])('rejects tracked loader provenance in a $name', ({ source }) => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-exported-loader-form-fixture-'),
    );

    try {
      fs.writeFileSync(path.join(fixtureRoot, 'entry.ts'), source);

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/entry\.ts.*exported.*createRequire.*provenance/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects symbolic-link entrypoints before dependency traversal', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-entrypoint-symlink-fixture-'),
    );

    try {
      fs.writeFileSync(path.join(fixtureRoot, 'target.ts'), 'export {};');
      fs.symlinkSync('target.ts', path.join(fixtureRoot, 'entry.ts'));

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/entrypoint.*symbolic link/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('rejects local runtime modules that resolve outside the project', () => {
    const fixtureRoot = fs.mkdtempSync(
      path.join(projectRoot, '.runtime-dependency-containment-fixture-'),
    );
    const externalModulePath = `${fixtureRoot}-external.ts`;

    try {
      fs.writeFileSync(
        path.join(fixtureRoot, 'entry.ts'),
        "import './escape';",
      );
      fs.writeFileSync(externalModulePath, 'export {};');
      fs.symlinkSync(externalModulePath, path.join(fixtureRoot, 'escape.ts'));

      expect(() =>
        findRuntimeModuleDependencies({
          projectRoot: fixtureRoot,
          entrypoints: ['entry.ts'],
        }),
      ).toThrow(/escape.*outside the project/i);
    } finally {
      fs.rmSync(fixtureRoot, { force: true, recursive: true });
      fs.rmSync(externalModulePath, { force: true });
    }
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

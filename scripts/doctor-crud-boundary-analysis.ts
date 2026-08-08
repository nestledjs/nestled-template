import ts from 'typescript'
import { Kind, parse, type FragmentDefinitionNode, type SelectionSetNode } from 'graphql'
import { getAuthOperations } from './doctor-auth-analysis'

export type CrudBoundaryViolation = {
  line: number
  message: string
}

type ModuleReference = {
  line: number
  moduleName: string
}

const sourceFileFor = (source: string, fileName: string): ts.SourceFile =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const lineFor = (sourceFile: ts.SourceFile, node: ts.Node): number =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

const moduleNameFrom = (node: ts.Expression | undefined): string | undefined =>
  node && ts.isStringLiteralLike(node) ? node.text : undefined

const getModuleReferences = (source: string, fileName: string): ModuleReference[] => {
  const sourceFile = sourceFileFor(source, fileName)
  const references: ModuleReference[] = []

  const addReference = (node: ts.Node, expression: ts.Expression | undefined) => {
    const moduleName = moduleNameFrom(expression)
    if (moduleName) references.push({ line: lineFor(sourceFile, node), moduleName })
  }

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addReference(node, node.moduleSpecifier)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      addReference(node, node.arguments[0])
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return references
}

const isGeneratedCrudModule = (moduleName: string): boolean =>
  moduleName.includes('/generated-crud/') || moduleName.endsWith('/generated-crud')

export const isHandwrittenApiFile = (filePath: string): boolean => {
  const normalizedPath = filePath.replaceAll('\\', '/')

  return (
    normalizedPath.endsWith('.ts') &&
    normalizedPath !== 'apps/api/src/app.module.ts' &&
    !normalizedPath.includes('libs/api/generated-crud/') &&
    !normalizedPath.endsWith('.spec.ts') &&
    !normalizedPath.endsWith('.test.ts')
  )
}

export const supportsAdminOnlyGeneratorBoundary = (version: string): boolean => {
  const versionMatch = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (versionMatch === null) return false

  const [, major, minor, patch] = versionMatch.map(Number)
  return major > 3 || (major === 3 && (minor > 0 || (minor === 0 && patch >= 3)))
}

export const getGraphqlRootFieldNames = (source: string): Set<string> => {
  const names = new Set<string>()

  for (const definition of parse(source).definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) continue
    for (const selection of definition.selectionSet.selections) {
      if (selection.kind === Kind.FIELD) names.add(selection.name.value)
    }
  }

  return names
}

type RootFieldAnalysis = {
  fragments: ReadonlyMap<string, FragmentDefinitionNode>
  generatedRootFields: ReadonlySet<string>
  operationName: string
  operationSource: string
  violations: CrudBoundaryViolation[]
}

const lineAtOffset = (source: string, offset: number): number =>
  source.slice(0, offset).split('\n').length

const getFragments = (sources: readonly string[]): Map<string, FragmentDefinitionNode> => {
  const fragments = new Map<string, FragmentDefinitionNode>()

  for (const source of sources) {
    for (const definition of parse(source).definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragments.set(definition.name.value, definition)
      }
    }
  }

  return fragments
}

const addGeneratedRootFieldViolation = (
  fieldName: string,
  offset: number,
  analysis: RootFieldAnalysis,
) => {
  analysis.violations.push({
    line: lineAtOffset(analysis.operationSource, offset),
    message:
      `Application SDK operation ${analysis.operationName} calls generated admin CRUD field ` +
      `${fieldName}; use the generated __Admin* document or call an explicit application resolver`,
  })
}

const checkRootSelections = (
  selectionSet: SelectionSetNode,
  analysis: RootFieldAnalysis,
  fragmentPath: ReadonlySet<string>,
  reportOffset?: number,
) => {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (analysis.generatedRootFields.has(selection.name.value)) {
        addGeneratedRootFieldViolation(
          selection.name.value,
          reportOffset ?? selection.loc?.start ?? 0,
          analysis,
        )
      }
      continue
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      checkRootSelections(selection.selectionSet, analysis, fragmentPath, reportOffset)
      continue
    }

    const fragmentName = selection.name.value
    const fragment = analysis.fragments.get(fragmentName)
    if (!fragment || fragmentPath.has(fragmentName)) continue

    const nextPath = new Set(fragmentPath)
    nextPath.add(fragmentName)
    const nextReportOffset = reportOffset ?? selection.loc?.start ?? 0
    checkRootSelections(fragment.selectionSet, analysis, nextPath, nextReportOffset)
  }
}

export const getPublicSdkGeneratedCrudViolations = (
  source: string,
  generatedRootFields: ReadonlySet<string>,
  fragmentSources: readonly string[] = [],
): CrudBoundaryViolation[] => {
  const violations: CrudBoundaryViolation[] = []
  const document = parse(source)
  const fragments = getFragments([source, ...fragmentSources])

  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) continue
    checkRootSelections(
      definition.selectionSet,
      {
        fragments,
        generatedRootFields,
        operationName: definition.name?.value ?? '(anonymous operation)',
        operationSource: source,
        violations,
      },
      new Set(),
    )
  }

  return violations
}

export const getGeneratedCrudImportViolations = (
  source: string,
  fileName = 'source.ts',
): CrudBoundaryViolation[] =>
  getModuleReferences(source, fileName)
    .filter(reference => isGeneratedCrudModule(reference.moduleName))
    .map(reference => ({
      line: reference.line,
      message:
        `Handwritten resolvers and services must not import generated admin CRUD (${reference.moduleName}); ` +
        'define an explicit input and Prisma query instead; there is no admin-only exception',
    }))

export const getLegacyCoreHelpersImportViolations = (
  source: string,
  fileName = 'source.ts',
): CrudBoundaryViolation[] =>
  getModuleReferences(source, fileName)
    .filter(reference => reference.moduleName.includes('/api/core/helpers'))
    .map(reference => ({
      line: reference.line,
      message:
        'Application API code must not import the removed core-helper library; build an explicit Prisma select instead',
    }))

export const getCrudAuthAnnotationLines = (schema: string): number[] =>
  schema
    .split('\n')
    .map((line, index) => (line.includes('@crudAuth') ? index + 1 : undefined))
    .filter((line): line is number => line !== undefined)

export const getCustomResolverNameViolations = (
  source: string,
  generatedMethodNames: ReadonlySet<string>,
  fileName = 'source.ts',
): CrudBoundaryViolation[] =>
  getAuthOperations(source, fileName)
    .filter(operation => operation.kind === 'graphql' && generatedMethodNames.has(operation.name))
    .map(operation => ({
      line: operation.line,
      message: `Custom resolver method "${operation.name}" collides with a generated CRUD field name`,
    }))

const declaresAdminOnly = (classDecorators: string, methodDecorators: string): boolean =>
  `${classDecorators}\n${methodDecorators}`.includes('@AdminOnly')

export const getNonAdminOperationViolations = (
  source: string,
  fileName = 'source.ts',
): CrudBoundaryViolation[] =>
  getAuthOperations(source, fileName).flatMap(operation => {
    const violations: CrudBoundaryViolation[] = []

    if (!operation.guardNames.includes('GqlAuthAdminGuard')) {
      violations.push({
        line: operation.line,
        message: `${operation.className}.${operation.name} must use GqlAuthAdminGuard`,
      })
    }

    if (!declaresAdminOnly(operation.classDecorators, operation.decorators)) {
      violations.push({
        line: operation.line,
        message: `${operation.className}.${operation.name} must declare @AdminOnly()`,
      })
    }

    return violations
  })

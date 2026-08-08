import ts from 'typescript'
import {
  buildSchema,
  Kind,
  parse,
  type FieldNode,
  type FragmentDefinitionNode,
  type FragmentSpreadNode,
  type InlineFragmentNode,
  type SelectionSetNode,
} from 'graphql'

export type GraphqlSource = {
  file: string
  source: string
}

export type TypeScriptSource = {
  file: string
  source: string
}

export type DatabaseFieldMetadata = {
  name: string
  type: string
}

export type DatabaseModelMetadata = {
  modelName: string
  fields: DatabaseFieldMetadata[]
}

export type PrismaSelect = Record<string, true | { select: PrismaSelect }>

export type FragmentSelectResult = {
  fragmentNames: string[]
  missingFragments: string[]
  select: PrismaSelect
  skippedFields: string[]
}

export type SdkOperation = {
  file: string
  name: string
  rootFields: string[]
}

export type InlineClientOperation = {
  file: string
  line: number
  name: string
}

export type SdkContractReport = {
  apiWithoutSdk: string[]
  inlineClientOperations: InlineClientOperation[]
  sdkWithoutApi: SdkRootMismatch[]
  sdkWithoutConsumer: SdkOperation[]
}

export type SdkRootMismatch = {
  file: string
  operation: string
  rootFields: string[]
}

export const normalizeContractPath = (file: string): string => file.replaceAll('\\', '/')

type FragmentReference = {
  definition: FragmentDefinitionNode
  file: string
}

const alphabetical = (left: string, right: string): number => left.localeCompare(right)

const mergeSelect = (target: PrismaSelect, addition: PrismaSelect): void => {
  for (const [fieldName, value] of Object.entries(addition)) {
    const current = target[fieldName]
    if (
      current !== true &&
      value !== true &&
      current?.select !== undefined &&
      value.select !== undefined
    ) {
      mergeSelect(current.select, value.select)
    } else if (current === undefined || (current === true && value !== true)) {
      target[fieldName] = value
    }
  }
}

const fragmentsFrom = (sources: readonly GraphqlSource[]): Map<string, FragmentReference> => {
  const fragments = new Map<string, FragmentReference>()

  for (const graphqlSource of sources) {
    for (const definition of parse(graphqlSource.source).definitions) {
      if (definition.kind !== Kind.FRAGMENT_DEFINITION) continue
      const existing = fragments.get(definition.name.value)
      if (existing) {
        throw new Error(
          `Duplicate fragment ${definition.name.value} in ${existing.file} and ${graphqlSource.file}`,
        )
      }
      fragments.set(definition.name.value, { definition, file: graphqlSource.file })
    }
  }

  return fragments
}

type SelectContext = {
  fragments: ReadonlyMap<string, FragmentReference>
  missingFragments: Set<string>
  models: ReadonlyMap<string, DatabaseModelMetadata>
  skippedFields: Set<string>
}

const selectForField = (
  selection: FieldNode,
  model: DatabaseModelMetadata,
  context: SelectContext,
  fragmentPath: ReadonlySet<string>,
): PrismaSelect => {
  const fieldName = selection.name.value
  const field = model.fields.find(candidate => candidate.name === fieldName)
  if (!field) {
    context.skippedFields.add(`${model.modelName}.${fieldName}`)
    return {}
  }

  const relatedModel = context.models.get(field.type)
  if (!relatedModel || !selection.selectionSet) return { [fieldName]: true }

  const nestedSelect = selectForSelectionSet(
    selection.selectionSet,
    relatedModel,
    context,
    fragmentPath,
  )
  if (Object.keys(nestedSelect).length > 0) {
    return { [fieldName]: { select: nestedSelect } }
  }

  context.skippedFields.add(`${model.modelName}.${fieldName}`)
  return {}
}

const selectForInlineFragment = (
  selection: InlineFragmentNode,
  model: DatabaseModelMetadata,
  context: SelectContext,
  fragmentPath: ReadonlySet<string>,
): PrismaSelect => {
  const typeName = selection.typeCondition?.name.value
  const fragmentModel = (typeName && context.models.get(typeName)) || model
  return selectForSelectionSet(selection.selectionSet, fragmentModel, context, fragmentPath)
}

const selectForFragmentSpread = (
  selection: FragmentSpreadNode,
  model: DatabaseModelMetadata,
  context: SelectContext,
  fragmentPath: ReadonlySet<string>,
): PrismaSelect => {
  const fragmentName = selection.name.value
  if (fragmentPath.has(fragmentName)) return {}

  const fragment = context.fragments.get(fragmentName)
  if (!fragment) {
    context.missingFragments.add(fragmentName)
    return {}
  }

  const fragmentModel = context.models.get(fragment.definition.typeCondition.name.value) ?? model
  const nextPath = new Set(fragmentPath)
  nextPath.add(fragmentName)
  return selectForSelectionSet(fragment.definition.selectionSet, fragmentModel, context, nextPath)
}

function selectForSelectionSet(
  selectionSet: SelectionSetNode,
  model: DatabaseModelMetadata,
  context: SelectContext,
  fragmentPath: ReadonlySet<string>,
): PrismaSelect {
  const select: PrismaSelect = {}

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      mergeSelect(select, selectForField(selection, model, context, fragmentPath))
      continue
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      mergeSelect(select, selectForInlineFragment(selection, model, context, fragmentPath))
      continue
    }

    mergeSelect(select, selectForFragmentSpread(selection, model, context, fragmentPath))
  }

  return select
}

export const buildPrismaSelectFromFragments = (options: {
  allSources: readonly GraphqlSource[]
  models: readonly DatabaseModelMetadata[]
  rootSources: readonly GraphqlSource[]
  targetModelName: string
}): FragmentSelectResult => {
  const fragments = fragmentsFrom(options.allSources)
  const rootFiles = new Set(options.rootSources.map(source => source.file))
  const rootFragments = [...fragments.values()].filter(
    fragment =>
      rootFiles.has(fragment.file) &&
      fragment.definition.typeCondition.name.value === options.targetModelName,
  )
  if (rootFragments.length === 0) {
    throw new Error(`No ${options.targetModelName} fragments found in ${[...rootFiles].join(', ')}`)
  }

  const models = new Map(options.models.map(model => [model.modelName, model]))
  const targetModel = models.get(options.targetModelName)
  if (!targetModel) {
    throw new Error(`No generated database metadata found for ${options.targetModelName}`)
  }

  const context: SelectContext = {
    fragments,
    missingFragments: new Set(),
    models,
    skippedFields: new Set(),
  }
  const select: PrismaSelect = {}

  for (const fragment of rootFragments) {
    mergeSelect(
      select,
      selectForSelectionSet(
        fragment.definition.selectionSet,
        targetModel,
        context,
        new Set([fragment.definition.name.value]),
      ),
    )
  }

  return {
    fragmentNames: rootFragments.map(fragment => fragment.definition.name.value).sort(alphabetical),
    missingFragments: [...context.missingFragments].sort(alphabetical),
    select,
    skippedFields: [...context.skippedFields].sort(alphabetical),
  }
}

const operationRootFields = (
  selectionSet: SelectionSetNode,
  fragments: ReadonlyMap<string, FragmentReference>,
  fragmentPath: ReadonlySet<string>,
): Set<string> => {
  const fields = new Set<string>()

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      fields.add(selection.name.value)
      continue
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      for (const field of operationRootFields(selection.selectionSet, fragments, fragmentPath)) {
        fields.add(field)
      }
      continue
    }

    const fragmentName = selection.name.value
    const fragment = fragments.get(fragmentName)
    if (!fragment || fragmentPath.has(fragmentName)) continue
    const nextPath = new Set(fragmentPath)
    nextPath.add(fragmentName)
    for (const field of operationRootFields(
      fragment.definition.selectionSet,
      fragments,
      nextPath,
    )) {
      fields.add(field)
    }
  }

  return fields
}

export const getSdkOperations = (sources: readonly GraphqlSource[]): SdkOperation[] => {
  const fragments = fragmentsFrom(sources)
  const operations: SdkOperation[] = []

  for (const graphqlSource of sources) {
    for (const definition of parse(graphqlSource.source).definitions) {
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue
      operations.push({
        file: graphqlSource.file,
        name: definition.name?.value ?? '(anonymous operation)',
        rootFields: [...operationRootFields(definition.selectionSet, fragments, new Set())].sort(
          alphabetical,
        ),
      })
    }
  }

  return operations.sort((left, right) => left.name.localeCompare(right.name))
}

const sdkModulePattern = /\/shared\/sdk$|\/shared\/sdk\/|^@[^/]+\/shared\/sdk$/

type SdkImportBindings = {
  imports: Set<string>
  namespaces: Set<string>
}

const collectSdkImportDeclaration = (
  statement: ts.Statement,
  bindings: SdkImportBindings,
): void => {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return
  if (!sdkModulePattern.test(statement.moduleSpecifier.text)) return

  const clause = statement.importClause
  if (!clause || clause.phaseModifier === ts.SyntaxKind.TypeKeyword || !clause.namedBindings) {
    return
  }

  if (ts.isNamespaceImport(clause.namedBindings)) {
    bindings.namespaces.add(clause.namedBindings.name.text)
    return
  }

  for (const element of clause.namedBindings.elements) {
    if (!element.isTypeOnly) bindings.imports.add(element.propertyName?.text ?? element.name.text)
  }
}

const collectNamespaceImports = (sourceFile: ts.SourceFile, bindings: SdkImportBindings): void => {
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      bindings.namespaces.has(node.expression.text)
    ) {
      bindings.imports.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

const collectSdkValueImports = (typeScriptSource: TypeScriptSource, imports: Set<string>): void => {
  const sourceFile = ts.createSourceFile(
    typeScriptSource.file,
    typeScriptSource.source,
    ts.ScriptTarget.Latest,
    true,
    typeScriptSource.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const bindings: SdkImportBindings = { imports, namespaces: new Set() }

  for (const statement of sourceFile.statements) collectSdkImportDeclaration(statement, bindings)
  collectNamespaceImports(sourceFile, bindings)
}

const getSdkValueImports = (sources: readonly TypeScriptSource[]): Set<string> => {
  const imports = new Set<string>()
  for (const typeScriptSource of sources) {
    collectSdkValueImports(typeScriptSource, imports)
  }

  return imports
}

const operationPattern = /\b(?:query|mutation|subscription)\s+([_A-Za-z]\w*)/g

export const getInlineClientOperations = (
  sources: readonly TypeScriptSource[],
): InlineClientOperation[] => {
  const operations: InlineClientOperation[] = []

  for (const typeScriptSource of sources) {
    const sourceFile = ts.createSourceFile(
      typeScriptSource.file,
      typeScriptSource.source,
      ts.ScriptTarget.Latest,
      true,
      typeScriptSource.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    const visit = (node: ts.Node): void => {
      if (
        ts.isTaggedTemplateExpression(node) &&
        ts.isIdentifier(node.tag) &&
        node.tag.text === 'gql'
      ) {
        const templateText = ts.isNoSubstitutionTemplateLiteral(node.template)
          ? node.template.text
          : [
              node.template.head.text,
              ...node.template.templateSpans.map(span => span.literal.text),
            ].join(' ')
        operationPattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = operationPattern.exec(templateText)) !== null) {
          operations.push({
            file: typeScriptSource.file,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            name: match[1],
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  return operations.sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line,
  )
}

export const getSdkContractReport = (options: {
  adminSources: readonly GraphqlSource[]
  applicationSources: readonly GraphqlSource[]
  clientSources: readonly TypeScriptSource[]
  schemaSource: string
}): SdkContractReport => {
  const schema = buildSchema(options.schemaSource)
  const schemaRootFields = new Set([
    ...Object.keys(schema.getQueryType()?.getFields() ?? {}),
    ...Object.keys(schema.getMutationType()?.getFields() ?? {}),
  ])
  const adminOperations = getSdkOperations(options.adminSources)
  const applicationOperations = getSdkOperations(options.applicationSources)
  const coveredFields = new Set(
    [...adminOperations, ...applicationOperations].flatMap(operation => operation.rootFields),
  )
  const consumerImports = getSdkValueImports(options.clientSources)
  const allOperations = [...adminOperations, ...applicationOperations]

  return {
    apiWithoutSdk: [...schemaRootFields]
      .filter(field => !coveredFields.has(field))
      .sort(alphabetical),
    inlineClientOperations: getInlineClientOperations(options.clientSources),
    sdkWithoutApi: allOperations
      .map(operation => ({
        file: operation.file,
        operation: operation.name,
        rootFields: operation.rootFields.filter(field => !schemaRootFields.has(field)),
      }))
      .filter(mismatch => mismatch.rootFields.length > 0)
      .sort(
        (left, right) =>
          left.file.localeCompare(right.file) || left.operation.localeCompare(right.operation),
      ),
    sdkWithoutConsumer: applicationOperations.filter(
      operation => !consumerImports.has(operation.name),
    ),
  }
}

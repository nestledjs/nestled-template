import ts from 'typescript'
import {
  buildSchema,
  Kind,
  parse,
  type FieldNode,
  type FragmentDefinitionNode,
  type FragmentSpreadNode,
  type InlineFragmentNode,
  type OperationDefinitionNode,
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

export type OperationPathSelectResult = {
  /** Path entry → number of document sites it matched. A zero is a stale annotation. */
  matched: Map<string, number>
  select: PrismaSelect
  skippedFields: string[]
}

/**
 * All field nodes named `fieldName` reachable at ONE level of a selection set — directly,
 * through fragment spreads, or through inline fragments. Spreads are resolved by name across
 * the whole SDK, so `login { ...UserTokenDetails }` still yields the `user` field the fragment
 * carries. The path guard stops fragment cycles the same way selectForFragmentSpread does.
 */
const fieldNodesNamed = (
  selectionSet: SelectionSetNode,
  fieldName: string,
  fragments: ReadonlyMap<string, FragmentReference>,
  fragmentPath: ReadonlySet<string>,
): FieldNode[] => {
  const nodes: FieldNode[] = []

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value === fieldName) nodes.push(selection)
      continue
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      nodes.push(...fieldNodesNamed(selection.selectionSet, fieldName, fragments, fragmentPath))
      continue
    }
    const fragment = fragments.get(selection.name.value)
    if (!fragment || fragmentPath.has(selection.name.value)) continue
    const nextPath = new Set(fragmentPath)
    nextPath.add(selection.name.value)
    nodes.push(
      ...fieldNodesNamed(fragment.definition.selectionSet, fieldName, fragments, nextPath),
    )
  }

  return nodes
}

/**
 * Every inline-fragment selection set conditioned on `typeName` reachable from a selection set —
 * descending through fields AND following fragment spreads by name across the whole SDK (with a
 * path guard against cycles), so `... on UserToken` nested inside a spread is not missed.
 */
const inlineFragmentSetsOn = (
  selectionSet: SelectionSetNode,
  typeName: string,
  fragments: ReadonlyMap<string, FragmentReference>,
  fragmentPath: ReadonlySet<string>,
): SelectionSetNode[] => {
  const sets: SelectionSetNode[] = []
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (selection.typeCondition?.name.value === typeName) sets.push(selection.selectionSet)
      sets.push(...inlineFragmentSetsOn(selection.selectionSet, typeName, fragments, fragmentPath))
      continue
    }
    if (selection.kind === Kind.FIELD) {
      if (selection.selectionSet) {
        sets.push(...inlineFragmentSetsOn(selection.selectionSet, typeName, fragments, fragmentPath))
      }
      continue
    }
    const fragment = fragments.get(selection.name.value)
    if (!fragment || fragmentPath.has(selection.name.value)) continue
    const nextPath = new Set(fragmentPath)
    nextPath.add(selection.name.value)
    sets.push(...inlineFragmentSetsOn(fragment.definition.selectionSet, typeName, fragments, nextPath))
  }
  return sets
}

/** Operation definitions across the whole SDK, parsed once so path matching doesn't reparse. */
const operationDefinitionsOf = (sources: readonly GraphqlSource[]): OperationDefinitionNode[] =>
  sources.flatMap(source =>
    parse(source.source).definitions.filter(
      (definition): definition is OperationDefinitionNode =>
        definition.kind === Kind.OPERATION_DEFINITION,
    ),
  )

/**
 * Where a path's first segment starts matching, and the segments still to walk. A type-scoped
 * entry (`UserToken.user`, leading capital) begins in every fragment defined ON that type plus
 * every inline fragment conditioned on it; a plain entry begins at every operation's root.
 */
const pathCursors = (
  entry: string,
  operations: readonly OperationDefinitionNode[],
  fragments: ReadonlyMap<string, FragmentReference>,
): { cursors: SelectionSetNode[]; remaining: string[] } => {
  const segments = entry.split('.').map(segment => segment.trim())
  if (!/^[A-Z]/.test(segments[0] ?? '')) {
    return { cursors: operations.map(operation => operation.selectionSet), remaining: segments }
  }
  const cursors = [...fragments.values()]
    .filter(fragment => fragment.definition.typeCondition.name.value === segments[0])
    .map(fragment => fragment.definition.selectionSet)
  for (const operation of operations) {
    cursors.push(...inlineFragmentSetsOn(operation.selectionSet, segments[0], fragments, new Set()))
  }
  return { cursors, remaining: segments.slice(1) }
}

/** Walk `remaining` segments from `cursors`, returning the field nodes at the final segment. */
const walkPathToLeaves = (
  cursors: readonly SelectionSetNode[],
  remaining: readonly string[],
  fragments: ReadonlyMap<string, FragmentReference>,
): FieldNode[] => {
  let current: SelectionSetNode[] = [...cursors]
  for (const [index, segment] of remaining.entries()) {
    const nodes = current.flatMap(cursor => fieldNodesNamed(cursor, segment, fragments, new Set()))
    if (index === remaining.length - 1) return nodes
    current = nodes
      .map(node => node.selectionSet)
      .filter((set): set is SelectionSetNode => set !== undefined)
  }
  return []
}

/**
 * The union of what SDK documents actually request at specific positions, as a Prisma select
 * on one model — the per-operation counterpart to buildPrismaSelectFromFragments' model-wide
 * union.
 *
 * A path entry is either:
 *   - an operation root field, dotted for nesting: `me`, `login.user` — matched against every
 *     operation definition in the SDK, following fragment spreads between segments;
 *   - a type-scoped field: `UserToken.user` (leading segment capitalized) — matched inside
 *     every fragment defined ON that type and every inline fragment conditioned on it. Use
 *     this when one field resolver serves the same field across many operations: any new
 *     operation returning that type is covered without touching the annotation.
 *
 * The selection under each matched field is interpreted against `targetModelName` exactly the
 * way buildPrismaSelectFromFragments interprets a fragment body: spreads followed across the
 * whole SDK, GraphQL-only fields dropped through the models metadata.
 */
export const buildPrismaSelectFromOperationPaths = (options: {
  allSources: readonly GraphqlSource[]
  models: readonly DatabaseModelMetadata[]
  paths: readonly string[]
  targetModelName: string
}): OperationPathSelectResult => {
  const fragments = fragmentsFrom(options.allSources)
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
  const operations = operationDefinitionsOf(options.allSources)
  const select: PrismaSelect = {}
  const matched = new Map<string, number>()

  for (const entry of options.paths) {
    const { cursors, remaining } = pathCursors(entry, operations, fragments)
    const leaves = walkPathToLeaves(cursors, remaining, fragments)
    matched.set(entry, leaves.length)
    for (const leaf of leaves) {
      if (!leaf.selectionSet) continue
      mergeSelect(select, selectForSelectionSet(leaf.selectionSet, targetModel, context, new Set()))
    }
  }

  return { matched, select, skippedFields: [...context.skippedFields].sort(alphabetical) }
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

/**
 * The PascalCase rule graphql-codegen applies to export names: split on case boundaries,
 * then capitalize each word's first letter and lowercase the rest — which flattens acronym
 * runs (`FAQS` → `Faqs`, `deleteCourseFAQ` → `DeleteCourseFaq`).
 */
export const codegenPascalCase = (name: string): string =>
  (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) ?? [name])
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')

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
    // The generated document const is the codegen-PascalCased operation name: `mutation
    // createPaymentTransaction` exports `CreatePaymentTransaction`, and acronym runs are
    // normalized (`deleteCourseFAQ` → `DeleteCourseFaq`, `FAQS` → `Faqs`). Consumers import
    // that const, never the declared name, so matching the declared name alone reported
    // every such operation as unconsumed — an oracle that, followed blindly, would have
    // deleted live staff mutations.
    sdkWithoutConsumer: applicationOperations.filter(
      operation =>
        !consumerImports.has(operation.name) &&
        !consumerImports.has(codegenPascalCase(operation.name)),
    ),
  }
}

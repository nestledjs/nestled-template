import ts from 'typescript'
import { decoratorName, decoratorsOf, unwrapExpression } from './doctor-typescript-analysis'

export type AccessPolicyScope = 'platform' | 'organization'

export type AccessPolicyDeclaration = {
  className: string
  decorator: string
  line: number
  name: string
  permissions: string[]
  scope: AccessPolicyScope
}

export type InlineAccessCheckViolation = {
  calls: string[]
  className: string
  line: number
  name: string
}

const graphqlOperationDecorators = new Set(['Mutation', 'Query', 'ResolveField', 'Subscription'])
const httpOperationDecorators = new Set([
  'All',
  'Delete',
  'Get',
  'Head',
  'Options',
  'Patch',
  'Post',
  'Put',
  'Sse',
])
const policyDecorators = new Map<string, AccessPolicyScope>([
  ['RequirePlatformPermission', 'platform'],
  ['RequireAllPlatformPermissions', 'platform'],
  ['RequireOrganizationPermission', 'organization'],
  ['RequireAllOrganizationPermissions', 'organization'],
])
const inlineAccessCalls = new Set([
  'assertPermission',
  'hasAnyPermissionInNamespace',
  'hasPermission',
  'requirePermission',
])

const methodName = (method: ts.MethodDeclaration, sourceFile: ts.SourceFile): string =>
  ts.isIdentifier(method.name) || ts.isStringLiteral(method.name)
    ? method.name.text
    : method.name.getText(sourceFile)

const isApiClass = (statement: ts.ClassDeclaration): boolean =>
  decoratorsOf(statement).some(decorator =>
    ['Controller', 'Resolver'].includes(decoratorName(decorator)),
  )

const isApiOperation = (method: ts.MethodDeclaration): boolean =>
  decoratorsOf(method).some(decorator => {
    const name = decoratorName(decorator)
    return graphqlOperationDecorators.has(name) || httpOperationDecorators.has(name)
  })

const stringLiterals = (node: ts.Node): string[] => {
  const values: string[] = []
  const visit = (current: ts.Node) => {
    if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
      values.push(current.text)
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return values
}

const permissionArguments = (decorator: ts.Decorator, scope: AccessPolicyScope): string[] => {
  if (!ts.isCallExpression(decorator.expression)) return []
  const args = decorator.expression.arguments
  if (scope === 'organization') return args[0] ? stringLiterals(args[0]) : []
  return args.flatMap(argument => stringLiterals(argument))
}

const policyDeclarations = (
  decorators: readonly ts.Decorator[],
  sourceFile: ts.SourceFile,
  className: string,
  name: string,
): AccessPolicyDeclaration[] =>
  decorators.flatMap(decorator => {
    const nameOfDecorator = decoratorName(decorator)
    const scope = policyDecorators.get(nameOfDecorator)
    if (!scope) return []
    return [
      {
        className,
        decorator: nameOfDecorator,
        line: sourceFile.getLineAndCharacterOfPosition(decorator.getStart(sourceFile)).line + 1,
        name,
        permissions: permissionArguments(decorator, scope),
        scope,
      },
    ]
  })

const calledAccessHelpers = (method: ts.MethodDeclaration): string[] => {
  const calls = new Set<string>()
  if (!method.body) return []

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      let name = ''
      if (ts.isIdentifier(expression)) name = expression.text
      if (ts.isPropertyAccessExpression(expression)) name = expression.name.text
      if (inlineAccessCalls.has(name)) calls.add(name)
    }
    ts.forEachChild(node, visit)
  }
  visit(method.body)
  return [...calls].sort((left, right) => left.localeCompare(right))
}

/** Read literal string properties only from one named top-level object-array declaration. */
export const readStringObjectArray = (
  source: string,
  variableName: string,
  properties: readonly string[],
): Array<Record<string, string>> => {
  const sourceFile = ts.createSourceFile(
    'catalog.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  // Find the declaration ANYWHERE in the tree, not only among top-level statements — a repo may
  // declare the catalog inside a function, module, or block, and a top-level-only scan hands back an
  // empty catalog that then reports every declared permission as "unknown" (fleet-upstream #120).
  let declaration: ts.VariableDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (declaration) return
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName
    ) {
      declaration = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  if (!declaration?.initializer) return []
  const initializer = unwrapExpression(declaration.initializer)
  if (!ts.isArrayLiteralExpression(initializer)) return []

  return initializer.elements.flatMap(element => {
    const value = unwrapExpression(element)
    if (!ts.isObjectLiteralExpression(value)) return []
    const entry: Record<string, string> = {}
    for (const member of value.properties) {
      if (!ts.isPropertyAssignment(member)) continue
      const name =
        ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : ''
      if (!properties.includes(name)) continue
      const propertyValue = unwrapExpression(member.initializer)
      if (ts.isStringLiteral(propertyValue) || ts.isNoSubstitutionTemplateLiteral(propertyValue)) {
        entry[name] = propertyValue.text
      }
    }
    return properties.every(property => entry[property]) ? [entry] : []
  })
}

export const analyzeAccessPolicies = (source: string, fileName = 'source.ts') => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declarations: AccessPolicyDeclaration[] = []
  const inlineViolations: InlineAccessCheckViolation[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !isApiClass(statement)) continue
    const className = statement.name?.text ?? '(anonymous class)'
    const classPolicies = policyDeclarations(
      decoratorsOf(statement),
      sourceFile,
      className,
      '(class)',
    )
    declarations.push(...classPolicies)

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !isApiOperation(member)) continue
      const name = methodName(member, sourceFile)
      const methodPolicies = policyDeclarations(decoratorsOf(member), sourceFile, className, name)
      declarations.push(...methodPolicies)
      const calls = calledAccessHelpers(member)
      if (calls.length > 0 && classPolicies.length === 0 && methodPolicies.length === 0) {
        inlineViolations.push({
          calls,
          className,
          line: sourceFile.getLineAndCharacterOfPosition(member.name.getStart(sourceFile)).line + 1,
          name,
        })
      }
    }
  }

  return { declarations, inlineViolations }
}

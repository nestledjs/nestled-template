import ts from 'typescript'

export type AuthOperationKind = 'graphql' | 'http'

export type AuthOperation = {
  authLevelDeclared: boolean
  classDecorators: string
  className: string
  decorators: string
  guardNames: string[]
  kind: AuthOperationKind
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

const authLevelDecorators = new Set(['Public', 'Authenticated', 'AdminOnly'])
const nonAuthGuardPattern = /Throttler|RateLimit/
const guardNamePattern = /^[A-Z]\w*Guard$/

const getDecorators = (node: ts.Node): readonly ts.Decorator[] =>
  ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []

const getDecoratorName = (decorator: ts.Decorator): string => {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression

  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return ''
}

const getDecoratorSource = (
  decorators: readonly ts.Decorator[],
  sourceFile: ts.SourceFile,
): string => decorators.map(decorator => decorator.getText(sourceFile)).join('\n')

const getClassKind = (decoratorNames: Set<string>): AuthOperationKind | undefined => {
  if (decoratorNames.has('Controller')) return 'http'
  if (decoratorNames.has('Resolver')) return 'graphql'
  return undefined
}

const isOperationDecorator = (name: string, kind: AuthOperationKind): boolean =>
  kind === 'http' ? httpOperationDecorators.has(name) : graphqlOperationDecorators.has(name)

const getMethodName = (method: ts.MethodDeclaration, sourceFile: ts.SourceFile): string => {
  if (ts.isIdentifier(method.name) || ts.isStringLiteral(method.name)) return method.name.text
  return method.name.getText(sourceFile)
}

const collectGuardNames = (node: ts.Node, guards: Set<string>) => {
  if (ts.isIdentifier(node) && guardNamePattern.test(node.text)) {
    guards.add(node.text)
  }
  ts.forEachChild(node, child => collectGuardNames(child, guards))
}

const getGuardNames = (decorators: readonly ts.Decorator[]): string[] => {
  const guards = new Set<string>()

  for (const decorator of decorators) {
    if (getDecoratorName(decorator) !== 'UseGuards') continue
    if (!ts.isCallExpression(decorator.expression)) continue

    for (const argument of decorator.expression.arguments) {
      collectGuardNames(argument, guards)
    }
  }

  return [...guards].sort((left, right) => left.localeCompare(right))
}

const hasAuthLevelDecorator = (decorators: readonly ts.Decorator[]): boolean =>
  decorators.some(decorator => authLevelDecorators.has(getDecoratorName(decorator)))

export const isAuthenticationGuardName = (guard: string): boolean =>
  !nonAuthGuardPattern.test(guard)

export const getGuardRank = (guards: string[]): number => {
  const authenticationGuards = guards.filter(isAuthenticationGuardName)
  if (authenticationGuards.includes('GqlAuthAdminGuard')) return 3
  if (authenticationGuards.some(guard => guard.includes('Scoped') || guard.includes('Owner'))) {
    return 2
  }
  if (authenticationGuards.includes('GqlAuthGuard')) return 1
  return authenticationGuards.length > 0 ? 1 : 0
}

export const getOperationGuardNames = (operation: AuthOperation): string[] => operation.guardNames

export const hasAuthenticationGuard = (operation: AuthOperation): boolean =>
  operation.guardNames.some(isAuthenticationGuardName)

export const declaresAuthLevel = (operation: AuthOperation): boolean => operation.authLevelDeclared

export const getAuthOperations = (source: string, fileName = 'source.ts'): AuthOperation[] => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const operations: AuthOperation[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue

    const classDecorators = getDecorators(statement)
    const classDecoratorNames = new Set(classDecorators.map(getDecoratorName))
    const kind = getClassKind(classDecoratorNames)
    if (!kind) continue

    const className = statement.name?.text ?? '(anonymous class)'
    const classDecoratorSource = getDecoratorSource(classDecorators, sourceFile)
    const classGuardNames = getGuardNames(classDecorators)
    const classDeclaresAuthLevel = hasAuthLevelDecorator(classDecorators)

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) continue

      const methodDecorators = getDecorators(member)
      if (
        !methodDecorators.some(decorator => isOperationDecorator(getDecoratorName(decorator), kind))
      ) {
        continue
      }

      const line =
        sourceFile.getLineAndCharacterOfPosition(member.name.getStart(sourceFile)).line + 1
      operations.push({
        authLevelDeclared: classDeclaresAuthLevel || hasAuthLevelDecorator(methodDecorators),
        classDecorators: classDecoratorSource,
        className,
        decorators: getDecoratorSource(methodDecorators, sourceFile),
        guardNames: [...new Set([...classGuardNames, ...getGuardNames(methodDecorators)])].sort(
          (left, right) => left.localeCompare(right),
        ),
        kind,
        line,
        name: getMethodName(member, sourceFile),
      })
    }
  }

  return operations
}

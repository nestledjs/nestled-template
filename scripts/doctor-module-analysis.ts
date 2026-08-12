import ts from 'typescript'
import { decoratorName, decoratorsOf, unwrapExpression } from './doctor-typescript-analysis'

export type NestModuleSource = {
  file: string
  source: string
}

type NestModuleDeclaration = {
  className: string
  importedNames: Set<string>
}

const propertyName = (property: ts.ObjectLiteralElementLike): string => {
  if (!('name' in property) || !property.name) return ''
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text
  }
  return ''
}

const getArrayDeclarations = (
  sourceFile: ts.SourceFile,
): Map<string, ts.ArrayLiteralExpression> => {
  const arrays = new Map<string, ts.ArrayLiteralExpression>()

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const initializer = unwrapExpression(declaration.initializer)
      if (ts.isArrayLiteralExpression(initializer)) arrays.set(declaration.name.text, initializer)
    }
  }

  return arrays
}

const collectReferences = (
  node: ts.Node,
  arrays: Map<string, ts.ArrayLiteralExpression>,
  references: Set<string>,
  resolvingArrays: Set<string>,
) => {
  if (ts.isIdentifier(node)) {
    const array = arrays.get(node.text)
    if (array && !resolvingArrays.has(node.text)) {
      resolvingArrays.add(node.text)
      collectReferences(array, arrays, references, resolvingArrays)
      resolvingArrays.delete(node.text)
      return
    }
    references.add(node.text)
    return
  }

  ts.forEachChild(node, child => collectReferences(child, arrays, references, resolvingArrays))
}

const getModuleImports = (
  declaration: ts.ClassDeclaration,
  arrays: Map<string, ts.ArrayLiteralExpression>,
): Set<string> => {
  const references = new Set<string>()
  const moduleDecorator = decoratorsOf(declaration).find(
    decorator => decoratorName(decorator) === 'Module',
  )
  if (!moduleDecorator || !ts.isCallExpression(moduleDecorator.expression)) return references

  const [rawMetadata] = moduleDecorator.expression.arguments
  if (!rawMetadata) return references
  const metadata = unwrapExpression(rawMetadata)
  if (!ts.isObjectLiteralExpression(metadata)) return references

  const importsProperty = metadata.properties.find(property => propertyName(property) === 'imports')
  if (!importsProperty || !ts.isPropertyAssignment(importsProperty)) return references

  collectReferences(importsProperty.initializer, arrays, references, new Set())
  return references
}

const analyzeModuleSource = ({ file, source }: NestModuleSource): NestModuleDeclaration[] => {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const arrays = getArrayDeclarations(sourceFile)

  return sourceFile.statements.flatMap(statement => {
    if (!ts.isClassDeclaration(statement) || !statement.name) return []
    if (!decoratorsOf(statement).some(decorator => decoratorName(decorator) === 'Module')) return []

    return [
      {
        className: statement.name.text,
        importedNames: getModuleImports(statement, arrays),
      },
    ]
  })
}

/** Return Nest module classes transitively reachable from every module declared in the root file. */
export const getRegisteredModuleClasses = (
  sources: NestModuleSource[],
  rootFile: string,
): Set<string> => {
  const declarations = sources.flatMap(analyzeModuleSource)
  const knownClasses = new Set(declarations.map(declaration => declaration.className))
  const importsByClass = new Map(
    declarations.map(declaration => [
      declaration.className,
      [...declaration.importedNames].filter(name => knownClasses.has(name)),
    ]),
  )
  const roots = sources
    .filter(source => source.file === rootFile)
    .flatMap(analyzeModuleSource)
    .map(declaration => declaration.className)
  const registered = new Set(roots)
  const pending = [...roots]

  while (pending.length > 0) {
    const current = pending.shift()
    if (!current) continue

    for (const imported of importsByClass.get(current) ?? []) {
      if (registered.has(imported)) continue
      registered.add(imported)
      pending.push(imported)
    }
  }

  return registered
}

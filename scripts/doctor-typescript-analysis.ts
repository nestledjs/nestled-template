import ts from 'typescript'

export const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] =>
  ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []

export const decoratorName = (decorator: ts.Decorator): string => {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression

  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return ''
}

export const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression
  }
  return current
}

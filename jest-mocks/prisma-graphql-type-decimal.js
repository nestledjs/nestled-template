// Mock for prisma-graphql-type-decimal ESM module
// This mock is used because the actual package is ESM-only and causes issues with Jest
const { GraphQLScalarType, Kind } = require('graphql')

const GraphQLDecimal = new GraphQLScalarType({
  name: 'Decimal',
  description: 'Mock Decimal scalar type for testing',
  serialize: String,
  parseValue(value) {
    return value
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return ast.value
    }
    return null
  },
})

module.exports = { GraphQLDecimal }

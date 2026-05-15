const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  mode: process.env.NODE_ENV || 'development',
  entry: path.resolve(__dirname, 'src/main.ts'),
  output: {
    path: path.resolve(__dirname, '../../dist/apps/api'),
    filename: 'main.js',
  },
  optimization: {
    minimize: false, // Disable minification to prevent GraphQL schema issues
  },
  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, '../../tsconfig.base.json'),
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true, // Faster builds, skip type checking (handled by IDE/CI)
            compilerOptions: {
              module: 'ESNext',
              moduleResolution: 'bundler',
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  externals: [
    // Custom externals function to handle Prisma npm packages
    function ({ request }, callback) {
      // Externalize actual Prisma npm packages (required for native binaries)
      // But NOT @nestled-template/api/prisma which is a local workspace module
      if (request && (
        request.includes('@prisma/client') ||
        request.includes('.prisma/client') ||
        request.includes('@prisma/adapter-pg') ||
        request.includes('@prisma/internals')
      )) {
        return callback(null, `commonjs ${request}`)
      }
      callback()
    },
    nodeExternals({
      allowlist: [
        // Allow all @nestled-template/api libs to be bundled
        /^@nestled-template\/api/,
      ],
    })
  ]
};

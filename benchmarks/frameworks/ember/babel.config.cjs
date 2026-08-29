'use strict';

const { buildMacros } = require('@embroider/macros/babel');
const macros = buildMacros({});

module.exports = {
  plugins: [
    [
      'babel-plugin-ember-template-compilation',
      {
        transforms: [...macros.templateMacros],
      },
    ],
    [require.resolve('decorator-transforms'), { runtime: { import: 'decorator-transforms/runtime' } }],
    [
      '@babel/plugin-transform-runtime',
      {
        absoluteRuntime: __dirname,
        useESModules: true,
        regenerator: false,
      },
    ],
    ...macros.babelMacros,
  ],
  generatorOpts: {
    compact: false,
  },
};

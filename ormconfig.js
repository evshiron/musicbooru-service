module.exports = {
  'type': 'sqlite',
  'database': 'data/default.db',
  'synchronize': true,
  // 'logging': true,
  'entities': [
    'src/**/*.model.ts'
  ],
};

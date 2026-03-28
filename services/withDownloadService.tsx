const { createRunOncePlugin } = require('@expo/config-plugins');

const pkg = require('./package.json');

const withDownloadService = (config) => {
  return config;
};

module.exports = createRunOncePlugin(withDownloadService, pkg.name, pkg.version);

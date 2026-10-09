// Metro config: the shipping engine and seed data are IMPORTED from the web
// client (`../public/js`), never copied. `watchFolders` lets Metro resolve and
// hot-reload files outside `mobile/`; the two CommonJS files carry a guarded
// `module.exports` tail for exactly this purpose.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const sharedJs = path.resolve(__dirname, '../public/js');

config.watchFolders = [...(config.watchFolders || []), sharedJs];

module.exports = config;

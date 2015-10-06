var debug = require('debug')('cosa');
var Model = require('./model');
var Immutable = require('./immutable');

module.exports = {
  Model: Model,
  Immutable: Immutable,
  db: require('./db'),
  init: function (uri, options) {
    debug('initializing cosa');
    module.exports.db.connect(uri, options);
  }
};

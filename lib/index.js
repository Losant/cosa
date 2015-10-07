var debug = require('debug')('cosa');
var Model = require('./model');
var Immutable = require('./immutable');

module.exports = {
  Model: Model,
  Immutable: Immutable,
  db: require('./db'),
  init: function (uri) {
    debug('initializing cosa');
    module.exports.db.init(uri || process.env.COSA_DB_URI);
  }
};

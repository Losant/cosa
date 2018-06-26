const debug = require('debug')('cosa');
const Model = require('./model');
const Immutable = require('./immutable');

/**
 * Main module that provides access to library classes and functions.
 * @module cosa
 */
module.exports = {

  Model: Model,

  Immutable: Immutable,

  /**
   * Database connection instance.
   * @see {@link Database}
   */
  db: require('./db'),

  /**
   * Initialize cosa and connect to the database. Explicitly calling the 
   * function is not needed if `process.env.COSA_DB_URI` is properly set.
   * @param {string} [uri] - URI to the database. If no URI is provided, the value 
   *    of `process.env.COSA_DB_URI` is used. See 
   *    https://docs.mongodb.com/manual/reference/connection-string/ for
   *    information on the URI format.
   */
  init: function (uri) {
    debug('initializing cosa');
    module.exports.db.init(uri || process.env.COSA_DB_URI);
  }
};

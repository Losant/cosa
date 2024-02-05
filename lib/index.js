import _debug from 'debug';
import _db from './db.js';

const debug = _debug('cosa');

/**
 * Main module that provides access to library classes and functions.
 * @module cosa
 */
export { default as Model } from './model.js';
export { default as Immutable } from './immutable.js';
/**
 * Database connection instance.
 * @see {@link Database}
 */
export const db = _db;
/**
 * Initialize cosa and connect to the database. Explicitly calling the
 * function is not needed if `process.env.COSA_DB_URI` is properly set.
 * @param {string} [uri] - URI to the database. If no URI is provided, the value
 *    of `process.env.COSA_DB_URI` is used. See
 *    https://docs.mongodb.com/manual/reference/connection-string/ for
 *    information on the URI format.
 * @returns {Promise} db.init promise
 */
export const init = function(uri) {
  debug('initializing cosa');
  return db.init(uri || process.env.COSA_DB_URI);
};

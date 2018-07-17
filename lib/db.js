const { promisify } = require('util');
const debug = require('debug')('cosa:db');
const defaults = require('defaults');
const EJSON = require('mongodb-extended-json');
const EventEmitter = require('events').EventEmitter;
const MongoClient = require('mongodb').MongoClient;
const mongoConnect = promisify(MongoClient.connect);
const { curry } = require('omnibelt');
const RESULT_FIELDS = [ 'insertedCount', 'insertedIds', 'matchedCount', 'modifiedCount', 'upsertedCount', 'deletedCount', 'upsertedIds' ];

const normalizeResult = (r) => {
  const result = {
    result: r.result,
    ops: r.ops
  };
  RESULT_FIELDS.forEach((type) => {
    if ('undefined' !== typeof r[type]) {
      result[type] = r[type];
    }
  });
  return result;
};

const actionOneOrMany = curry(async (action, collection, isMultiple, ...params) => {
  const type = isMultiple ? `${action}Many` : `${action}One`;
  debug(`db.${collection.collectionName}.${type}`, ...params);
  const r = await collection[type](...params);
  return normalizeResult(r);
});

const insertOneOrMany = actionOneOrMany('insert');
const updateOneOrMany = actionOneOrMany('update');
const removeOneOrMany = actionOneOrMany('remove');

/**
 * Singleton that provides methods for connecting to a MongoDB collection.
 * @class Database
 */
class Database extends EventEmitter {
  constructor() {
    super();
    this._db = null;
    this._connectionStatus = 'disconnected';
    Object.defineProperty(this, 'connectionStatus', {
      enumerable: true,
      get: function() {
        return this._connectionStatus;
      }
    });
  }

  /**
   * Initialize the database connection.
   * @param {string} [uri] - URI to the database. If no URI is provided, the value
     *    of `process.env.COSA_DB_URI` is used. See
     *    https://docs.mongodb.com/manual/reference/connection-string/ for
     *    information on the URI format.
   * @see {@link init}
   * @returns {Promise} returns the db when connected
   */
  async init(uri) {
    this._uri = uri || process.env.COSA_DB_URI;
    if (!(/mongodb:\/\//).test(this._uri)) {
      throw new Error('invalid mongodb uri');
    }
    debug(`connecting to database: ${this._uri}`);
    this._connectionStatus = 'connecting';
    this.emit('connecting');
    try {
      this._db = await mongoConnect(this._uri);
    } catch (err) {
      debug('failed to connect', err);
      this._db = null;
      this._connectionStatus = 'disconnected';
      throw err;
    }
    this._connectionStatus = 'connected';
    this._db.on('close', () => {
      debug('database connection closed');
      this._db = null;
      this._connectionStatus = 'disconnected';
      this.emit('disconnect');
    });
    this.emit('connect', this);
    debug('connected to database');
    return this;
  }

  /**
   * Fetch a specific database collection.
   * @param {string} name - Collection name.
   * @param {object} [options] - Optional collection settings.
   * @returns {Promise} resolves with the connection
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Db.html#collection}
   */
  async collection(name, options) {
    if (this._connectionStatus === 'connected') {
      debug(`loading collection ${name}`);
      const collection = await this._db.collection(name, options);
      debug(`collection ${name} loaded`);
      return collection;
    } else if (this._connectionStatus === 'connecting') {
      debug(`waiting on connection before loading collection ${name}`);
      return new Promise((resolve) => {
        this.on('connect', async () => {
          const collection = await this._db.collection(name, options);
          debug(`collection ${name} loaded`);
          return resolve(collection);
        });
      });
    } else {
      await this.init();
      const collection = await this._db.collection(name, options);
      debug(`collection ${name} loaded`);
      return collection;
    }
  }

  /**
   * Fetches documents from a collection with the given query.
   * @param {string} collectionName - Name of the collection.
   * @param {object} query - MongoDB query object.
   * @param {object} [options] - MongoDB query options.
   * @param {object} [options.fields] - The fields to return in the query. Object of fields to include or exclude (not both), {'a':1
   * @param {(object|Array)} [options.sort] - Set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
   * @param {number} [options.skip=0] - Set to skip N documents ahead in your query (useful for pagination).
   * @param {object} [options.limit=1000] - Sets the limit of documents returned in the query.
   * @param {object} [options.count=false] - Should the count of items be returned instead of the items themselves.
   * @param {object} [options.findOne=false] - Should a single item be returned.
   * @returns {Cursor} returns Cursor object
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#find}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#findOne}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#count}
   */
  async find(collectionName, query, options) {
    options = defaults(options, {
      fields: undefined,
      sort: undefined,
      skip: undefined,
      limit: options.count ? null : 1000,
      count: false,
      findOne: false
    });
    query = EJSON.deserialize(query);
    debug('getting db collection');
    const collection = await this.collection(collectionName);
    if (options.count) {
      const countOptions = { limit: options.limit, skip: options.skip, sort: options.sort };
      debug(`db.${collection.collectionName}.count`, query, countOptions);
      return collection.count(query, options);
    } else if (options.findOne) {
      const findOptions = { fields: options.fields, limit: options.limit, skip: options.skip, sort: options.sort };
      debug(`db.${collection.collectionName}.findOne`, query, findOptions);
      return collection.findOne(query, options);
    } else {
      const findOptions = { fields: options.fields, limit: options.limit, skip: options.skip, sort: options.sort };
      debug(`db.${collection.collectionName}.find (toArray)`, query, findOptions);
      return collection.find(query, options);
    }
  }

  /**
   * Inserts the given docs into a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {(object|Array)} docs - Documents objects to insert.
   * @returns {Promise} resolves with an object with results, and ops as keys
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#insertmany}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#insertOne}
   */
  async insert(collectionName, docs) {
    debug('getting db collection');
    docs = EJSON.deserialize(docs);
    const collection = await this.collection(collectionName);
    return insertOneOrMany(collection, Array.isArray(docs), docs);
  }

  /**
   * Updates docs in a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {object} query - Query to find which documents to update.
   * @param {object} update - Document properties to update.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {boolean} [options.multiple=false] - Should multiple documents be updated.
   * @param {boolean} [options.upsert=false] - Should documents be inserted if they don't already exist..
   * @returns {Promise} resolves with an object with results, and ops as keys
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#updateMany}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#updateOne}
   */
  async update(collectionName, query, update, options) {
    options = defaults(options, {
      multiple: false,
      upsert: false
    });
    debug('getting db collection');
    query = EJSON.deserialize(query);
    update = EJSON.deserialize(update);
    const collection = await this.collection(collectionName);
    const updateOptions = { upsert: options.upsert };
    return updateOneOrMany(collection, options.multiple, query, update, updateOptions);
  }

  /**
   * Removes docs from a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {object} query - Query to find which documents to remove.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {boolean} [options.multiple=false] - Should multiple documents be removed.
   * @returns {Promise} resolves with an object with results, and ops as keys
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#deleteMany}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#deleteOne}
   */
  async remove(collectionName, query, options) {
    options = defaults(options, {
      multiple: false
    });
    debug('getting db collection');
    query = EJSON.deserialize(query);
    const collection = await this.collection(collectionName);
    return removeOneOrMany(collection, options.multiple, query);
  }

  /**
   * Executes aggregation pipeline against a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {object} pipeline - Aggregation pipeline.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {boolean} [options.explain=false] - Should should the execution plan be returned.
   * @returns {Promise} resovles with the result of the aggregatation from mongo
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#aggregate}
   */
  async aggregate(collectionName, pipeline, options) {
    options = defaults(options, {
      explain: false
    });
    debug('getting db collection');
    const collection = await this.collection(collectionName);
    return new Promise((resolve, reject) => {
      collection.aggregate(pipeline, options, function(err, r) {
        if (err) { return reject(err); }
        return resolve(r);
      });
    });
  }

  /**
   * Returns list of unique values for the given key across a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {string} key - Document property.
   * @param {object} query - Query to find which documents evaluate.
   * @param {object} [options] - Optional settings see mongo documentation
   * @returns {Promise} resovles with the result of the distinct query from mongo
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#distinct}
   */
  async distinct(collectionName, key, query, options) {
    debug('getting db collection');
    query = EJSON.deserialize(query);
    const collection = await this.collection(collectionName);
    return collection.distinct(key, query, options);
  }

}

module.exports = new Database();

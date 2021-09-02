const debug = require('debug')('cosa:db');
const defaults = require('defaults');
const { ObjectId } = require('bson');
const { EventEmitter } = require('events');
const { MongoClient } = require('mongodb');
const {
  curry, split, last, pipe, isEmpty, clamp
} = require('omnibelt');

const RESULT_FIELDS = [ 'insertedId', 'insertedCount', 'insertedIds', 'matchedCount', 'modifiedCount', 'upsertedCount', 'upsertedId', 'deletedCount', 'upsertedIds' ];
const getDbName = (uri) => {
  let name = pipe(split('/'), last)(uri);
  if (name.indexOf('?') !== -1) {
    name = name.slice(0, name.indexOf('?'));
  }
  return name;
};

const normalizeResult = (r) => {
  const result = {
    acknowledged: r.acknowledged
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
const deleteOneOrMany = actionOneOrMany('delete');

const deserialize = (data = {}) => {
  if (Array.isArray(data)) {
    return data.map(deserialize);
  }
  if (typeof data !== 'object') {
    return data;
  }

  if (data.__type === 'bson.ObjectID') {
    return new ObjectId(data.id);
  }

  if (data.__type === 'Date') {
    return new Date(data.valueOf());
  }

  const keys = Object.keys(data);
  if (keys.length === 1) {
    if (keys[0] === '$oid') {
      return new ObjectId(data[keys[0]]);
    }

    if (keys[0] === '$date') {
      return new Date(data[keys[0]]);
    }
  }
  keys.forEach((key) => {
    data[key] = deserialize(data[key]);
  });
  return data;
};

/**
 * Singleton that provides methods for connecting to a MongoDB collection.
 * @class Database
 */
class Database extends EventEmitter {
  constructor() {
    super();
    this._db = null;
    this._client = null;
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
   * @param {object} [options] - Optional collection settings.
   * @see {@link init}
   * @returns {Promise} returns the db when connected
   */
  async init(uri, options) {
    options = options || {};
    this._uri = uri || process.env.COSA_DB_URI;
    if (!(/mongodb:\/\//).test(this._uri)) {
      throw new Error('invalid mongodb uri');
    }
    // so we don't mess up people environment variables.
    const dbName = options.dbName || getDbName(this._uri);
    debug(`connecting to database: ${this._uri}`);
    this._connectionStatus = 'connecting';
    this.emit('connecting');
    try {
      this._client = new MongoClient(this._uri);
      this._client = await this._client.connect();
      this._db = await this._client.db(dbName);
    } catch (err) {
      debug('failed to connect', err);
      this._db = null;
      this._client = null;
      this._connectionStatus = 'disconnected';
      throw err;
    }
    this._connectionStatus = 'connected';
    // may want to investigate if this is always or if it could be close? not really sure why this changed
    this._client.on('connectionPoolClosed', () => {
      debug('database connection closed');
      this._db = null;
      this._client = null;
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
   * @param {object} [options.fields] - (deprecated, will be mapped to projection) The fields to return in the query. Object of fields to include or exclude (not both), {'a':1
   * @param {object} [options.projection] - The projection to return in the query. Object of projection to include or exclude (not both), {'a':1
   * @param {(object|Array)} [options.sort] - Set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
   * @param {number} [options.skip=0] - Set to skip N documents ahead in your query (useful for pagination).
   * @param {object} [options.limit=1000] - Sets the limit of documents returned in the query.
   * @param {object} [options.count=false] - get a count of the items, instead of the items themselves.
   * @param {object} [options.findOne=false] - Should a single item be returned.
   * @param {object} [options.readPreference] - the read preference for the query with one of the read constants
   * @returns {Cursor} returns Cursor object
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#find}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#findOne}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#count}
   * @see {@link https://github.com/mongodb/node-mongodb-native/blob/357cbf689735c2447bfb05d73c142f1a5b88ca91/lib/read_preference.js#L69}
   */
  async find(collectionName, query, options) {
    options = defaults(options, {
      projection: undefined,
      sort: undefined,
      skip: undefined,
      limit: options && options.count ? null : 1000,
      count: false,
      findOne: false,
      readPreference: undefined
    });
    query = deserialize(query || {});
    debug('getting db collection');
    const collection = await this.collection(collectionName);
    if (options.count) {
      const countOptions = { limit: options.limit, skip: options.skip };
      debug(`db.${collection.collectionName}.countDocuments`, query, countOptions);
      if (!query || isEmpty(query)) {
        const count = await collection.estimatedDocumentCount();
        return clamp(0, options.limit || Infinity, count - (options.skip || 0));
      } else {
        return collection.countDocuments(query, options);
      }
    } else if (options.findOne) {
      const findOptions = {
        projection: options.projection || options.fields,
        limit: options.limit,
        skip: options.skip,
        sort: options.sort,
        readPreference: options.readPreference
      };
      debug(`db.${collection.collectionName}.findOne`, query, findOptions);
      return collection.findOne(query, options);
    } else {
      const findOptions = {
        projection: options.projection || options.fields,
        limit: options.limit,
        skip: options.skip,
        sort: options.sort,
        readPreference: options.readPreference
      };
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
    docs = deserialize(docs);
    const collection = await this.collection(collectionName);
    const results = await insertOneOrMany(collection, Array.isArray(docs), docs);

    if (Array.isArray(docs)) {
      docs.forEach((doc, i) => {
        doc._id = results.insertedIds[`${i}`];
      });
    } else {
      docs._id = results.insertedId;
    }

    results.ops = docs;
    return results;
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
    query = deserialize(query);
    update = deserialize(update);
    const collection = await this.collection(collectionName);
    const updateOpts = { upsert: options.upsert };
    return updateOneOrMany(collection, options.multiple, query, update, updateOpts);
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
    query = deserialize(query);
    const collection = await this.collection(collectionName);
    return deleteOneOrMany(collection, options.multiple, query);
  }

  /**
   * Executes aggregation pipeline against a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {object} pipeline - Aggregation pipeline.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {boolean} [options.explain=false] - Should should the execution plan be returned.
   * @param {object} [options.readPreference] - the read preference for the query
   * @returns {Promise} resolves with the result of the aggregation from mongo
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#aggregate}
   * @see {@link https://github.com/mongodb/node-mongodb-native/blob/357cbf689735c2447bfb05d73c142f1a5b88ca91/lib/read_preference.js#L69}
   */
  async aggregate(collectionName, pipeline, options) {
    options = defaults(options, {
      explain: undefined // do not use false that will actually cause an explain. https://github.com/mongodb/node-mongodb-native/pull/2626/files#diff-17118eb51bf767027b48c4456850f1b0b9efcd4be4322b5f26898a42731e4621R28
    });
    debug('getting db collection');
    const collection = await this.collection(collectionName);
    return collection.aggregate(pipeline, options);
  }

  /**
   * Returns list of unique values for the given key across a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {string} key - Document property.
   * @param {object} query - Query to find which documents evaluate.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {object} [options.readPreference] - the read preference for the query
   * @returns {Promise} resolves with the result of the distinct query from mongo
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#distinct}
   * @see {@link https://github.com/mongodb/node-mongodb-native/blob/357cbf689735c2447bfb05d73c142f1a5b88ca91/lib/read_preference.js#L69}
   */
  async distinct(collectionName, key, query, options) {
    debug('getting db collection');
    query = deserialize(query);
    const collection = await this.collection(collectionName);
    return collection.distinct(key, query, options);
  }


  async replace(collectionName, query, replace) {
    const collection = await this.collection(collectionName);
    query = deserialize(query);
    replace = deserialize(replace);
    debug(`db.${collection.collectionName}.replaceOne`, query, replace);
    const r = await collection.replaceOne(query, replace);
    r.ops = replace;
    return normalizeResult(r);
  }


}

module.exports = new Database();

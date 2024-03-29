import _debug from 'debug';
import { EventEmitter } from 'events';
import { MongoClient, ObjectId } from 'mongodb';
import {
  curry, split, last, pipe, clamp, isPlainObject, isNilOrEmpty
} from 'omnibelt';
import Immutable from './immutable.js';
const RESULT_FIELDS = [ 'insertedId', 'insertedCount', 'insertedIds', 'matchedCount', 'modifiedCount', 'upsertedCount', 'upsertedId', 'deletedCount', 'upsertedIds' ];
const getDbName = (uri) => {
  let name = pipe(split('/'), last)(uri);
  if (name.indexOf('?') !== -1) {
    name = name.slice(0, name.indexOf('?'));
  }
  return name;
};
const debug = _debug('cosa:db');

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

const deserialize = (data) => {
  if (Array.isArray(data)) {
    return data.map(deserialize);
  }

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Immutable.isImmutable(data)) {
    return data.toObject();
  }

  if (!isPlainObject(data)) {
    return data;
  }

  const keys = Object.keys(data);
  if (keys.length === 1) {
    if (keys[0] === '$oid') {
      return new ObjectId(data[keys[0]]);
    }
  }
  const result = {};
  keys.forEach((key) => {
    result[key] = deserialize(data[key]);
  });
  return result;
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
      const opts = {};
      if (process.env.COSA_DB_READ_PREFERENCE) {
        opts.readPreference = process.env.COSA_DB_READ_PREFERENCE;
      }
      this._db = await this._client.db(dbName, opts);
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
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Db.html#collection}
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
   * @param {number} [options.batchSize] - number of items per batch (default in mongo driver is 1000)
   * @param {boolean} [options.noCursorTimeout] - boolan, if the cursor can time out after being idle, mongo driver default is false
   * @param {number} [options.maxTimeMS] - maximum amount of time (in ms) this cursor is allowed to live
   * @param {object} [options.session] - Mongo session or Cosa Mongo session wrapper
   * @returns {Cursor} returns Cursor object
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#find}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#findOne}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#count}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/FindOptions.html#readPreference}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/FindOptions.html#batchSize}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/FindOptions.html#noCursorTimeout}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/FindOptions.html#maxTimeMS}
   */
  async find(collectionName, query, options = {}) {
    query = deserialize(query);
    const collection = await this.collection(collectionName);
    const session = options.session?.mongoSession || options.session;
    if (options.count) {
      if (isNilOrEmpty(query) && !session) {
        const countOptions = {
          readPreference: options.readPreference,
          maxTimeMS: options.maxTimeMS
        };
        debug(`db.${collection.collectionName}.estimatedDocumentCount`, query, countOptions);
        const count = await collection.estimatedDocumentCount(countOptions);
        return clamp(0, options.limit || Infinity, count - (options.skip || 0));
      } else {
        const countOptions = {
          limit: options.limit,
          skip: options.skip,
          readPreference: options.readPreference,
          maxTimeMS: options.maxTimeMS,
          session
        };
        debug(`db.${collection.collectionName}.countDocuments`, query, countOptions);
        return collection.countDocuments(query, countOptions);
      }
    } else if (options.findOne) {
      const findOptions = {
        projection: options.projection || options.fields,
        skip: options.skip,
        sort: options.sort,
        readPreference: options.readPreference,
        noCursorTimeout: options.noCursorTimeout,
        maxTimeMS: options.maxTimeMS,
        session
      };
      debug(`db.${collection.collectionName}.findOne`, query, findOptions);
      return collection.findOne(query, findOptions);
    } else {
      const findOptions = {
        projection: options.projection || options.fields,
        limit: options.limit === undefined ? 1000 : options.limit,
        skip: options.skip,
        sort: options.sort,
        readPreference: options.readPreference,
        batchSize: options.batchSize,
        noCursorTimeout: options.noCursorTimeout,
        maxTimeMS: options.maxTimeMS,
        session
      };
      debug(`db.${collection.collectionName}.find`, query, findOptions);
      return collection.find(query, findOptions);
    }
  }

  /**
   * Inserts the given docs into a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {(object|Array)} docs - Documents objects to insert.
   * @param {object} options - options on insert
   * @param {object} [options.writeConcern] - the write concern
   * @param {object} [options.session] - Mongo session or Cosa Mongo session wrapper
   * @returns {Promise} resolves with an object with results, and ops as keys
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#insertMany}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#insertOne}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/BulkWriteOptions.html#writeConcern}
   */
  async insert(collectionName, docs, { writeConcern, session } = {}) {
    docs = deserialize(docs);
    const collection = await this.collection(collectionName);
    const results = await insertOneOrMany(collection, Array.isArray(docs), docs, {
      writeConcern,
      session: session?.mongoSession || session
    });
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
   * @param {boolean} [options.upsert=false] - Should documents be inserted if they don't already exist.
   * @param {object} [options.writeConcern] - the write concern options
   * @param {object} [options.session] - Mongo session or Cosa Mongo session wrapper
   * @returns {Promise} resolves with an object with results, and ops as keys
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#updateMany}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#updateOne}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/BulkWriteOptions.html#writeConcern}
   */
  async update(collectionName, query, update, options = {}) {
    query = deserialize(query);
    update = deserialize(update);
    const collection = await this.collection(collectionName);
    return updateOneOrMany(collection, options.multiple, query, update, {
      upsert: options.upsert,
      writeConcern: options.writeConcern,
      session: options.session?.mongoSession || options.session
    });
  }

  /**
   * Removes docs from a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {object} query - Query to find which documents to remove.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {boolean} [options.multiple=false] - Should multiple documents be removed.
   * @param {object} [options.writeConcern] - the write concern options
   * @param {object} [options.session] - Mongo session or Cosa Mongo session wrapper
   * @returns {Promise} resolves with an object with results, and ops as keys
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#deleteMany}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#deleteOne}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/DeleteOptions.html#writeConcern}
   */
  async remove(collectionName, query, options = {}) {
    query = deserialize(query);
    const collection = await this.collection(collectionName);
    return deleteOneOrMany(collection, options.multiple, query, {
      writeConcern: options.writeConcern,
      session: options.session?.mongoSession || options.session
    });
  }

  /**
   * Executes aggregation pipeline against a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {object} pipeline - Aggregation pipeline.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {object} [options.readPreference] - the read preference for the query with one of the read constants
   * @param {number} [options.batchSize] - number of items per batch (default in mongo driver is 1000)
   * @param {number} [options.maxTimeMS] - maximum amount of time (in ms) this cursor is allowed to live
   * @param {object} [options.session] - Mongo session or Cosa Mongo session wrapper
   * @returns {Promise} resolves with the result of the aggregation from mongo
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#aggregate}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/AggregateOptions.html#readPreference}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/AggregateOptions.html#batchSize}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/AggregateOptions.html#maxTimeMS}
   */
  async aggregate(collectionName, pipeline, options = {}) {
    pipeline = deserialize(pipeline);
    const collection = await this.collection(collectionName);
    return collection.aggregate(pipeline, {
      readPreference: options.readPreference,
      batchSize: options.batchSize,
      maxTimeMS: options.maxTimeMS,
      session: options.session?.mongoSession || options.session
    });
  }

  /**
   * Returns list of unique values for the given key across a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {string} key - Document property.
   * @param {object} query - Query to find which documents evaluate.
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {string} [options.readPreference] - the read preference for the query
   * @param {number} [options.maxTimeMS] - maximum amount of time (in ms) this cursor is allowed to live
   * @param {object} [options.session] - Mongo session or Cosa Mongo session wrapper
   * @returns {Promise} resolves with the result of the distinct query from mongo
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#distinct}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/CommandOperationOptions.html#readPreference}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/CommandOperationOptions.html#maxTimeMS}
   */
  async distinct(collectionName, key, query, options = {}) {
    query = deserialize(query);
    const collection = await this.collection(collectionName);
    return collection.distinct(key, query, {
      readPreference: options.readPreference,
      maxTimeMS: options.maxTimeMS,
      session: options.session?.mongoSession || options.session
    });
  }

  /**
   * Replace a doc in a collection.
   * @param {string} collectionName - Name of the collection.
   * @param {object} query - Query to find which documents evaluate.
   * @param {object} replace - doc to save on the collection
   * @param {object} [options] - Optional settings see mongo documentation
   * @param {object} [options.writeConcern] - the write concern options
   * @param {object} [options.session] - Mongo session or Cosa Mongo session wrapper
   * @returns {Promise} resolves with the result of the distinct query from mongo
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/Collection.html#replaceOne}
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/interfaces/ReplaceOptions.html#writeConcern}
   */
  async replace(collectionName, query, replace, { writeConcern, session } = {}) {
    const collection = await this.collection(collectionName);
    query = deserialize(query);
    replace = deserialize(replace);
    debug(`db.${collection.collectionName}.replaceOne`, query, replace);
    const r = await collection.replaceOne(query, replace, {
      writeConcern,
      session: session?.mongoSession || session
    });
    r.ops = replace;
    return normalizeResult(r);
  }

}

export default new Database();

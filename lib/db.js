var util = require('util');
var q = require('q');
var debug = require('debug')('cosa:db');
var defaults = require('defaults');
var EJSON = require('mongodb-extended-json');
var EventEmitter = require('events').EventEmitter;
var MongoClient = require('mongodb').MongoClient;

/**
 * Singleton that provides methods for connecting to a MongoDB collection.
 * @class Database
 */
var Database = function () {
  this._db = null;
  this._connectionStatus = 'disconnected';
  Object.defineProperty(this, 'connectionStatus', {
    enumerable: true,
    get: function () {
      return this._connectionStatus;
    }
  });
};

util.inherits(Database, EventEmitter);

function normalizeResult (r) {
  var result = {
    result: r.result,
    ops: r.ops
  };
  if ('undefined' !== typeof r.insertedCount) {
    result.insertedCount = r.insertedCount;
  }
  if ('undefined' !== typeof r.insertedIds) {
    result.insertedIds = r.insertedIds;
  }
  if ('undefined' !== typeof r.matchedCount) {
    result.matchedCount = r.matchedCount;
  }
  if ('undefined' !== typeof r.modifiedCount) {
    result.modifiedCount = r.modifiedCount;
  }
  if ('undefined' !== typeof r.upsertedCount) {
    result.upsertedCount = r.upsertedCount;
  }
  if ('undefined' !== typeof r.deletedCount) {
    result.deletedCount = r.deletedCount;
  }
  if ('undefined' !== typeof r.upsertedIds) {
    result.upsertedIds = r.upsertedIds;
  }
  return result;
}

/**
 * Initialize the database connection.
 * @param {string} [uri] - URI to the database. If no URI is provided, the value
   *    of `process.env.COSA_DB_URI` is used. See
   *    https://docs.mongodb.com/manual/reference/connection-string/ for
   *    information on the URI format.
 * @see {@link init} 
 * @returns {Promise}
 */
Database.prototype.init = function (uri) {
  var deferred = q.defer();
  this._uri = uri || process.env.COSA_DB_URI;
  if (!/mongodb:\/\//.test(this._uri)) {
    deferred.reject(new Error('invalid mongodb uri'));
  }
  debug('connecting to database: ' + this._uri);
  this._connectionStatus = 'connecting';
  this.emit('connecting');
  MongoClient.connect(this._uri, function (err, db) {
    if (err) {
      debug('failed to connect', err);
      this._db = null;
      this._connectionStatus = 'disconnected';
      return deferred.reject(err);
    }
    this._db = db;
    this._connectionStatus = 'connected';
    this._db.on('close', function () {
      debug('database connection closed');
      this._db = null;
      this._connectionStatus = 'disconnected';
      this.emit('disconnect');
    }.bind(this));
    this.emit('connect', this);
    debug('connected to database');
    return deferred.resolve(this);
  }.bind(this));
  return deferred.promise;
};

/**
 * Fetch a specific database collection.
 * @param {string} name - Collection name.
 * @param {object} [options] - Optional collection settings.
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Db.html#collection}
 */
Database.prototype.collection = function (name, options) {
  var deferred = q.defer();
  if (this._connectionStatus === 'connected') {
    debug('loading collection ' + name);
    this._db.collection(name, options, function (err, collection) {
      if (err) { return deferred.reject(err); }
      debug('collection ' + name + ' loaded');
      deferred.resolve(collection);
    });
  } else if (this._connectionStatus === 'connecting') {
    debug('waiting on connection before loading collection ' + name);
    this.on('connect', function () {
      this._db.collection(name, options, function (err, collection) {
        if (err) { return deferred.reject(err); }
        debug('collection ' + name + ' loaded');
        deferred.resolve(collection);
      });
    });
  } else {
    this.init()
      .then(() => {
        this._db.collection(name, options, (err, collection) => {
          if (err) { return deferred.reject(err); }
          debug('collection ' + name + ' loaded');
          deferred.resolve(collection);
        });
      }, deferred.reject);
  }
  return deferred.promise;
};

/**
 * Fetches documents from a collection with the given query.
 * @param {string} collection - Name of the collection.
 * @param {object} query - MongoDB query object.
 * @param {object} [options] - MongoDB query options.
 * @param {object} [options.fields] - The fields to return in the query. Object of fields to include or exclude (not both), {'a':1
 * @param {(object|Array)} [options.sort] - Set to sort the documents coming back from the query. Array of indexes, [['a', 1]] etc.
 * @param {number} [options.skip=0] - Set to skip N documents ahead in your query (useful for pagination).
 * @param {object} [options.limit=1000] - Sets the limit of documents returned in the query.
 * @param {object} [options.count=false] - Should the count of items be returned instead of the items themselves.
 * @param {object} [options.findOne=false] - Should a single item be returned.
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#find}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#findOne}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#count}
 */
Database.prototype.find = function (collection, query, options) {
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
  return this.collection(collection)
    .then(function (collection) {
      var findOptions;
      if (options.count) {
        var countOptions = { limit: options.limit, skip: options.skip, sort: options.sort };
        debug('db.' + collection.collectionName + '.count', query, countOptions);
        return collection.count(query, options);
      } else if (options.findOne) {
        findOptions = { fields: options.fields, limit: options.limit, skip: options.skip, sort: options.sort };
        debug('db.' + collection.collectionName + '.findOne', query, findOptions);
        return collection.findOne(query, options);
      } else {
        findOptions = { fields: options.fields, limit: options.limit, skip: options.skip, sort: options.sort };
        debug('db.' + collection.collectionName + '.find (toArray)', query, findOptions);
        return collection.find(query, options);
      }
    });
};

/**
 * Inserts the given docs into a collection.
 * @param {string} collection - Name of the collection.
 * @param {(object|Array)} docs - Documents objects to insert.
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#insertmany}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#insertOne}
 */
Database.prototype.insert = function (collection, docs) {
  debug('getting db collection');
  docs = EJSON.deserialize(docs);
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      if (Array.isArray(docs)) {
        debug('db.' + collection.collectionName + '.insertMany', docs);
        collection.insertMany(docs, function (err, r) {
          if (err) { return deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      } else {
        debug('db.' + collection.collectionName + '.insertOne', docs);
        collection.insertOne(docs, function (err, r) {
          if (err) { return deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      }
      return deferred.promise;
    });
};

/**
 * Updates docs in a collection.
 * @param {string} collection - Name of the collection.
 * @param {object} query - Query to find which documents to update.
 * @param {object} update - Document properties to update.
 * @param {object} [options]
 * @param {boolean} [options.multiple=false] - Should multiple documents be updated.
 * @param {boolean} [options.upsert=false] - Should documents be inserted if they don't already exist..
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#updateMany}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#updateOne}
 */
Database.prototype.update = function (collection, query, update, options) {
  options = defaults(options, {
    multiple: false,
    upsert: false
  });
  debug('getting db collection');
  query = EJSON.deserialize(query);
  update = EJSON.deserialize(update);
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      var updateOptions = { upsert: options.upsert };
      if (options.multiple) {
        debug('db.' + collection.collectionName + '.updateMany', query, update, options);
        collection.updateMany(query, update, updateOptions, function (err, r) {
          if (err) { return deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      } else {
        debug('db.' + collection.collectionName + '.updateOne', query, update, options);
        collection.updateOne(query, update, updateOptions, function (err, r) {
          if (err) { return deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      }
      return deferred.promise;
    });
};

/**
 * Removes docs from a collection.
 * @param {string} collection - Name of the collection.
 * @param {object} query - Query to find which documents to remove.
 * @param {object} [options]
 * @param {boolean} [options.multiple=false] - Should multiple documents be removed.
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#deleteMany}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#deleteOne}
 */
Database.prototype.remove = function (collection, query, options) {
  options = defaults(options, {
    multiple: false
  });
  debug('getting db collection');
  query = EJSON.deserialize(query);
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      if (options.multiple) {
        debug('db.' + collection.collectionName + '.deleteMany', query);
        collection.deleteMany(query, function (err, r) {
          if (err) { return deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      } else {
        debug('db.' + collection.collectionName + '.deleteOne', query);
        collection.deleteOne(query, function (err, r) {
          if (err) { return deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      }
      return deferred.promise;
    });
};

/**
 * Executes aggregation pipeline against a collection.
 * @param {string} collection - Name of the collection.
 * @param {object} pipeline - Aggregation pipeline.
 * @param {object} [options]
 * @param {boolean} [options.explain=false] - Should should the execution plan be returned.
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#aggregate}
 */
Database.prototype.aggregate = function (collection, pipeline, options) {
  options = defaults(options, {
    explain: false
  });
  debug('getting db collection');
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      debug('db.' + collection.collectionName + '.aggregate', pipeline, options);
      collection.aggregate(pipeline, options, function (err, r) {
        if (err) { return deferred.reject(err); }
        return deferred.resolve(r);
      });
      return deferred.promise;
    });
};

/**
 * Returns list of unique values for the given key across a collection.
 * @param {string} collection - Name of the collection.
 * @param {string} key - Document property.
 * @param {object} query - Query to find which documents evaluate.
 * @param {object} [options]
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#distinct}
 */
Database.prototype.distinct = function (collection, key, query, options) {
  debug('getting db collection');
  query = EJSON.deserialize(query);
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      debug('db.' + collection.collectionName + '.distinct', key, query, options);
      collection.distinct(key, query, options, function (err, r) {
        if (err) { return deferred.reject(err); }
        return deferred.resolve(r);
      });
      return deferred.promise;
    });
};

module.exports = new Database();

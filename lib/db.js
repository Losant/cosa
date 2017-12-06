var util = require('util');
var q = require('q');
var debug = require('debug')('cosa:db');
var defaults = require('defaults');
var EJSON = require('mongodb-extended-json');
var EventEmitter = require('events').EventEmitter;
var MongoClient = require('mongodb').MongoClient;

var Cursor = require('./cursor');

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

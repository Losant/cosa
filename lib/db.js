var util = require('util');
var q = require('q');
var debug = require('debug')('cosa:db');
var defaults = require('defaults');
var EventEmitter = require('events').EventEmitter;
var MongoClient = require('mongodb').MongoClient;

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

Database.prototype.connect = function (uri, options) {
  var deferred = q.defer();
  if (!/mongodb:\/\//.test(uri)) {
    deferred.reject(new Error('invalid mongodb uri'));
  }
  this._uri = uri;
  this._options = options;
  debug('connecting to database: ' + this._uri);
  this._connectionStatus = 'connecting';
  this.emit('connecting');
  MongoClient.connect(this._uri, this._options, function (err, db) {
    if (err) {
      debug('failed to connect', err);
      return deferred.reject(err);
    }
    this._db = db;
    this._connectionStatus = 'connected';
    this.emit('connect', this);
    debug('connected to database');
    return deferred.resolve(this);
  }.bind(this));
  return deferred.promise;
};

Database.prototype.close = function () {
  var deferred = q.defer();
  if (this.connectionStatus === 'connected' && this._db) {
    this._db.close(function (err) {
      if (err) { return deferred.reject(err); }
      this._db = null;
      this.emit('close');
      return deferred.resolve();
    }.bind(this));
  } else {
    deferred.resolve();
  }
  return deferred.promise;
};

Database.prototype.collection = function (name, options) {
  var deferred = q.defer();
  if (this.connectionStatus === 'connected') {
    debug('loading collection ' + name);
    this._db.collection(name, options, function (err, collection) {
      if (err) { return deferred.reject(err); }
      debug('collection ' + name + ' loaded');
      deferred.resolve(collection);
    });
  } else {
    if (this.connectionStatus !== 'connecting') {
      this.connect();
    }
    debug('waiting on connection before loading collection ' + name);
    this.on('connect', function () {
      this._db.collection(name, options, function (err, collection) {
      if (err) { return deferred.reject(err); }
      debug('collection ' + name + ' loaded');
      deferred.resolve(collection);
    });
    }.bind(this));
  }
  return deferred.promise;
};

Database.prototype.find = function (collection, query, options) {
  options = defaults(options, {
    fields: undefined,
    sort: undefined,
    skip: undefined,
    limit: 1000,
    count: false,
    findOne: false
  });
  debug('getting db collection');
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      if (options.count) {
        var countOptions = { limit: options.limit, skip: options.skip, sort: options.sort };
        debug('db.' + collection.collectionName + '.count', query, countOptions);
        collection.count(query, options, function (err, count) {
          if (err) { deferred.reject(err); }
          return deferred.resolve({ count: count });
        });
      } else if (options.findOne) {
        var findOptions = { fields: options.fields, limit: options.limit, skip: options.skip, sort: options.sort };
        debug('db.' + collection.collectionName + '.findOne', query, findOptions);
        collection.findOne(query, options, function (err, doc) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(doc);
        });
      } else {
        var findOptions = { fields: options.fields, limit: options.limit, skip: options.skip, sort: options.sort };
        debug('db.' + collection.collectionName + '.find', query, findOptions);
        collection.find(query, options).toArray(function (err, docs) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(docs);
        });
      }
      return deferred.promise;
    });
}

Database.prototype.insert = function (collection, docs) {
  debug('getting db collection');
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      if (Array.isArray(docs)) {
        debug('db.' + collection.collectionName + '.insertMany', docs);
        collection.insertMany(docs, function (err, r) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      } else {
        debug('db.' + collection.collectionName + '.insertOne', docs);
        collection.insertOne(docs, function (err, r) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      }
      return deferred.promise;
    });
}

Database.prototype.update = function (collection, query, update, options) {
  options = defaults(options, {
    multiple: false,
    upsert: false
  });
  debug('getting db collection');
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      var updateOptions = { upsert: options.upsert };
      if (options.multiple) {
        debug('db.' + collection.collectionName + '.updateMany', query, update, options);
        collection.updateMany(query, update, updateOptions, function (err, r) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      } else {
        debug('db.' + collection.collectionName + '.updateOne', query, update, options);
        collection.updateOne(query, update, updateOptions, function (err, r) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      }
      return deferred.promise;
    });
}

Database.prototype.remove = function (collection, query, options) {
  options = defaults(options, {
    multiple: false
  });
  debug('getting db collection');
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      if (options.multiple) {
        debug('db.' + collection.collectionName + '.deleteMany', query);
        collection.deleteMany(query, function (err, r) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      } else {
        debug('db.' + collection.collectionName + '.deleteOne', query);
        collection.deleteOne(query, function (err, r) {
          if (err) { deferred.reject(err); }
          return deferred.resolve(normalizeResult(r));
        });
      }
      return deferred.promise;
    });
}

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
        if (err) { deferred.reject(err); }
        return deferred.resolve(r);
      });
      return deferred.promise;
    });
}

Database.prototype.distinct = function (collection, key, query, options) {
  debug('getting db collection');
  return this.collection(collection)
    .then(function (collection) {
      var deferred = q.defer();
      debug('db.' + collection.collectionName + '.distinct', key, query, options);
      collection.distinct(key, query, options, function (err, r) {
        if (err) { deferred.reject(err); }
        return deferred.resolve(r);
      });
      return deferred.promise;
    });
}


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

module.exports = new Database();

var q = require('q');
var assign = require('object-assign');
var bson = require('bson');
var joi = require('joi');
var etag = require('etag');
var debug = require('debug')('cosa:model');
var objectPath = require('object-path');
var defaults = require('defaults');
var clone = require('clone');
var util = require('util');
var EJSON = require('mongodb-extended-json');
var Immutable = require('./immutable');
Immutable.use(require('./defined-object'));
Immutable.use('array', require('./array'));
Immutable.use(Date, require('./date'));
Immutable.use(bson.ObjectId, require('./bson-objectId'));
Immutable.use(require('./object'));

var db = require('./db');

function define (definition) {

  definition = defaults(definition, {
    properties: {},
    methods: {},
    virtuals:{}
  });

  if (!definition.collection && !definition.abstract) {
    throw new Error('A model must have a collection unless defined as abstract');
  }

  definition.properties._id = {
    type: 'objectid'
  };

  definition.properties._etag = {
    type: 'string'
  };

  definition.properties.__modified = {
    type: 'array',
    enumerable: false,
    default: []
  };

  definition._schema = _buildSchema(definition);

  return {

    create: function (data) {
      return _create(data, definition);
    },

    extend: function (subDefinition) {
      return _extend(subDefinition, definition);
    },

    isA: function (obj) {
      return Immutable.isImmutableType(obj, definition.name || 'object');
    },

    count: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      options.count = true;
      var collection = definition.collection;
      debug('counting ' + JSON.stringify(query) + ' in ' + collection);
      return db.find(collection, query, options)
        .then(function (result) {
          return result.count;
        }.bind(this));
    },

    find: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      var collection = definition.collection;
      debug('finding ' + JSON.stringify(query) + ' in ' + collection);
      return db.find(collection, query, options)
        .then(function (result) {
          return result.map(function (item) {
            return _create(item, definition);
          });
        }.bind(this));
    },

    findOne: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      options.findOne = true;
      var collection = definition.collection;
      debug('finding one' + JSON.stringify(query) + ' in ' + collection);
      return db.find(collection, query, options)
        .then(function (result) {
          if (!result) {
            return null;
          } else {
            return !result ? null : _create(result, definition);
          }
        }.bind(this));
    },

    update: function (query, update, options) {
      query = assign({}, query, definition.where);
      options = defaults(options, { autoSet: true });
      var collection = definition.collection;
      if (options.autoSet) {
        update = { $set: update };
      }
      delete options.autoSet;
      debug('updating ' + JSON.stringify(query) + ' from ' + collection);
      return db.update(collection, query, update, options);
    },

    remove: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      var collection = definition.collection;
      debug('removing ' + JSON.stringify(query) + ' from ' + collection);
      return db.remove(collection, query, options);
    },

    distinct: function (key, query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      var collection = definition.collection;
      debug('finding distinct "' + key + '" ' + JSON.stringify(query) + ' from ' + collection);
      return db.distinct(collection, key, query, options);
    },

    aggregate: function (pipeline, options) {
      var collection = definition.collection;
      debug('aggregating ' + JSON.stringify(pipeline) + ' from ' + collection);
      return db.aggregate(collection, pipeline, options);
    }

  };

};

function _create (data, definition) {

  var _markAsModified = function (obj, path) {
    if (Array.isArray(path)) {
      path = path.join('.');
    }
    var shouldAdd = true;
    obj.__modified = obj.__modified.filter(function (value) {
      shouldAdd = shouldAdd && !(path.indexOf(value + '.', 0) === 0);
      return !(value.indexOf(path + '.', 0) === 0);
    });
    if (shouldAdd) {
      obj.__modified.push(path);
    }
  };

  definition.methods.is = function (obj) {
    if (this === obj) { return true; }
    if ('undefined' === typeof obj || obj === null) { return false; }
    if (this.__type !== obj.__type) { return false; }
    if (!this._id || !obj._id) { return false; }
    return this._id.toObject().toHexString() === this._id.toObject().toHexString();
  };

  definition.methods.equals = function (obj) {
    if (this === obj) { return true; }
    return this.is(obj) && this._etag === obj._etag && !this.isModified() && !obj.isModified();
  };

  definition.methods.isNew = function () {
    return 'undefined' === typeof this._id;
  };

  definition.methods.isModified = function (path) {
    if (path) {
      if (Array.isArray(path)) {
        path = path.join('.');
      }
      for (var i = 0, l = this.__modified.length; i < l; i++) {
        var value = this.__modified[i];
        if (value === path || value.indexOf(path + '.', 0) === 0) {
          return true;
        }
      }
      return false;
    } else {
      return this.__modified.length > 0;
    }
  };

  definition.methods.get = function (path) {
    return objectPath.get(this, path);
  };

  definition.methods.set = function (pathOrObj, value, options) {
    return this.mutate(function () {
      if ('object' === typeof pathOrObj && !Array.isArray(pathOrObj)) {
        options = defaults(value, { silent: false });
        assign(this, pathOrObj);
        if (!options.silent) {
          Object.keys(pathOrObj).forEach(function (item) {
            _markAsModified(this, item);
          }.bind(this));
        }
      } else {
        options = defaults(options, { silent: false });
        objectPath.set(this, pathOrObj, value);
        if (!options.silent) {
          _markAsModified(this, pathOrObj);
        }
      }
    });
  };

  definition.methods.del = function (path) {
    return this.mutate(function () {
      objectPath.del(this, path);
      _markAsModified(this, path);
    });
  };

  definition.methods.has = function (path) {
    return objectPath.has(this, path);
  };

  definition.methods.toJSON = function (options) {
    options = defaults(options, {
      virtuals: true,
      extended: true
    });
    function addVirtuals (def, obj) {
      if (def.virtuals) {
        Object.keys(def.virtuals).forEach(function (name) {
          obj[name] = def.virtuals[name].apply(obj);
        }.bind(this));
      }
      if (def.properties) {
        Object.keys(obj).forEach(function (name) {
          if (!def.properties[name]) { return; }
          addVirtuals(def.properties[name], obj[name]);
        });
      }
    }
    var json = clone(this.toObject());
    delete json.__modified;
    if (options.virtuals) {
      addVirtuals(definition, json);
    }
    return options.extended ? EJSON.inflate(json) : json;
  };

  definition.methods.validate = function (options) {
    var deferred = q.defer();
    options = defaults(options, {
      abortEarly: false,
      convert: false,
      allowUnknown: false,
      skipFunctions: true,
      stripUnknown: false,
    });
    joi.validate(this.toObject(), definition._schema, options, function (err, value) {
      if (err) { return deferred.reject(err); }
      deferred.resolve(value);
    });
    return deferred.promise;
  };

  definition.methods.save = function (options) {
    if (!this.isNew() && !this.isModified()) {
      return q.resolve(this);
    }
    var before = 'function' === typeof this.beforeSave ?
      q(this.beforeSave()) : q.resolve();
    return before.then(function () {
      return this.validate(options)
        .then(function (value) {
          var obj = this.toJSON({ virtuals: false, extended: false });
          var newEtag = etag(JSON.stringify(obj));
          if (!this.isNew()) {
            var query = { _id: this._id, _etag: this._etag };
            var set = { _etag: newEtag };
            this.__modified.forEach(function (path) {
              set[path] = obj[path];
            });
            var update = { $set: set };
            var collection = definition.collection;
            debug('updating ' + collection + ': ' + JSON.stringify(update));
            return db.update(collection, query, update)
              .then(function (result) {
                debug('update into ' + collection + ' successful', result);
                var updatedModel = this.set({
                  _etag: newEtag,
                  __modified: []
                }, { silent: true });
                if ('function' === typeof updatedModel.afterSave) {
                  updatedModel.afterSave();
                }
                return updatedModel;
              }.bind(this));
          } else {
            var collection = definition.collection;
            obj._etag = newEtag;
            debug('inserting into ' + collection + ': ' + JSON.stringify(obj));
            return db.insert(collection, obj)
              .then(function (result) {
                debug('insert into ' + collection + ' successful', result);
                var obj = Array.isArray(result.ops) ? result.ops[0] : result.ops;
                var newModel = _create(obj, definition);
                if ('function' === typeof newModel.afterSave) {
                  newModel.afterSave();
                }
                return newModel;
              }.bind(this));
          }
        }.bind(this));
    }.bind(this));
  };

  definition.methods.remove = function (options) {
    var collection = definition.collection;
    var query = { _id: this._id, _etag: this._etag };
    var before = 'function' === typeof this.beforeRemove ?
      q(this.beforeRemove()) : q.resolve();
    return before.then(function () {
      debug('removing ' + JSON.stringify(query) + ' in ' + collection);
      return db.remove(collection, query)
        .then(function (result) {
          debug('remove from ' + collection + ' successful');
          if ('function' === typeof this.afterRemove) {
            this.afterRemove();
          }
          return result;
        }.bind(this));
    }.bind(this));
  };

  return Immutable.create(data, { definition: definition });
};

function _extend (definition, superDef) {
  var newDef = clone(definition);
  if (!newDef.collection) {
    newDef.collection = superDef.collection;
  }
  newDef.properties = defaults(newDef.properties, superDef.properties || {});
  newDef.methods = defaults(newDef.methods, superDef.methods || {});
  newDef.virtuals = defaults(newDef.virtuals, superDef.virtuals || {});
  return define(newDef);
};

module.exports = {
  define: define
};

function _buildSchema (definition) {
  var schema = {};
  for (var p in definition.properties) {
    var propertyDef = definition.properties[p];
    if (propertyDef.type !== 'virtual') {
      schema[p] = _buildPropertySchema(p, propertyDef);
    }
  }
  return schema;
}

function _buildPropertySchema (name, propertyDef) {
  var schema = null;
  switch (propertyDef.type.trim().toLowerCase()) {
    case 'array':
      schema = joi.array();
      if ('undefined' !== typeof propertyDef.items) {
        schema = schema.items(_buildPropertySchema(name + '.items', propertyDef.items));
      }
      if ('undefined' !== typeof propertyDef.sparse) { schema = schema.sparse(propertyDef.sparse); }
      if (propertyDef.unique) { schema = schema.unique(); }
      break;
    case 'binary':
      schema = joi.binary();
      if ('undefined' !== typeof propertyDef.encoding) { schema = schema.encoding(propertyDef.encoding); }
      break;
    case 'boolean':
      schema = joi.boolean();
      break;
    case 'date':
      schema = joi.date();
      if (propertyDef.iso) { schema = schema.iso(); }
      if ('undefined' !== typeof propertyDef.format) { schema = schema.format(propertyDef.format); }
      break;
    case 'number':
      schema = joi.number();
      if ('undefined' !== typeof propertyDef.greater) { schema = schema.greater(propertyDef.greater); }
      if ('undefined' !== typeof propertyDef.less) { schema = schema.less(propertyDef.less); }
      if ('undefined' !== typeof propertyDef.integer) { schema = schema.integer(propertyDef.integer); }
      if ('undefined' !== typeof propertyDef.precision) { schema = schema.precision(propertyDef.precision); }
      if ('undefined' !== typeof propertyDef.multiple) { schema = schema.multiple(propertyDef.multiple); }
      if (propertyDef.negative) { schema = schema.negative(); }
      if (propertyDef.positive) { schema = schema.positive(); }
      break;
    case 'object':
      schema = joi.object();
      if ('undefined' !== typeof propertyDef.constr) {
        schema = schema.type(propertyDef.constr);
      }
      if ('undefined' !== typeof propertyDef.properties) {
        var keys = {};
        for (var p in propertyDef.properties) {
          if (propertyDef.properties[p].type !== 'virtual') {
            keys[p] = _buildPropertySchema(name + '.' + p, propertyDef.properties[p]);
          }
        }
        schema = schema.keys(keys);
      }
      if ('undefined' !== typeof propertyDef.unknown) { schema = schema.unknown(propertyDef.unknown); }
      if ('undefined' !== typeof propertyDef.rename) { schema = schema.rename(propertyDef.rename); }
      if ('undefined' !== typeof propertyDef.requiredKeys) { schema = schema.requiredKeys(propertyDef.requiredKeys); }
      break;
    case 'string':
      schema = joi.string();
      if (propertyDef.insensitive) { schema = schema.insensitive(); }
      if (propertyDef.creditCard) { schema = schema.creditCard(); }
      if ('undefined' !== typeof propertyDef.regex) { schema = schema.regex(propertyDef.regex); }
      if (propertyDef.alphanum) { schema = schema.alphanum(); }
      if (propertyDef.token) { schema = schema.token(); }
      if (propertyDef.email) { schema = schema.email(); }
      if (propertyDef.guid) { schema = schema.guid(); }
      if (propertyDef.hostname) { schema = schema.hostname(); }
      if (propertyDef.lowercase) { schema = schema.lowercase(); }
      if (propertyDef.uppercase) { schema = schema.uppercase(); }
      if (propertyDef.trim) { schema = schema.trim(); }
      break;
    case 'objectid':
      schema = joi.object().type(bson.ObjectId);
    case 'any':
    case '*':
      schema = joi.any();
      break;
    default:
      throw new Error('Invalid type (' + propertyDef.type + ') for property ' + name);
  }
  if ('undefined' !== typeof propertyDef.min) { schema = schema.min(propertyDef.min); }
  if ('undefined' !== typeof propertyDef.max) { schema = schema.max(propertyDef.max); }
  if ('undefined' !== typeof propertyDef.length) { schema = schema.length(propertyDef.length); }
  if ('undefined' !== typeof propertyDef.allow) { schema = schema.allow(propertyDef.allow); }
  if ('undefined' !== typeof propertyDef.valid) { schema = schema.valid(propertyDef.valid); }
  if ('undefined' !== typeof propertyDef.invalid) { schema = schema.invalid(propertyDef.invalid); }
  if (propertyDef.forbidden) { schema = schema.forbidden(); }
  if (propertyDef.strip) { schema = schema.strip(); }
  if (propertyDef.required) { schema = schema.required(); }
  if ('undefined' !== typeof propertyDef.strict) { schema = schema.strict(propertyDef.strict); }
  if ('undefined' !== typeof propertyDef.label) { schema = schema.label(propertyDef.label); }
  if (propertyDef.raw) { schema = schema.raw(); }
  if ('undefined' !== typeof propertyDef.default) { schema = schema.default(propertyDef.default, 'default'); }
  return schema;

}

const q = require('q');
const assign = require('object-assign');
const bson = require('bson');
const joi = require('joi');
const etag = require('etag');
const debug = require('debug')('cosa:model');
const objectPath = require('object-path');
const defaults = require('defaults');
const clone = require('clone');
const EJSON = require('mongodb-extended-json');
const Cursor = require('./cursor');
const errors = require('./errors');
const Immutable = require('./immutable');
Immutable.use(require('./defined-object'));
Immutable.use('array', require('./array'));
Immutable.use(Date, require('./date'));
Immutable.use('objectid', require('./bson-objectId'));
Immutable.use(require('./object'));

const db = require('./db');

/**
 * Static class for working with Models
 * @namespace Model
 */

 /**
  * 
  * @memberof Model
  */
const define = (definition) => {

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

  definition.properties.__original = {
    type: '*',
    enumerable: false,
    default: null
  };

  definition._schema = _buildSchema(definition);

  return {

    create: (data) => {
      return _create(data, definition);
    },

    extend: (subDefinition) => {
      return _extend(subDefinition, definition);
    },

    isA: (obj) => {
      return Immutable.isImmutableType(obj, definition.name || 'object');
    },

    count: (query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      options.count = true;
      const collection = definition.collection;
      debug('counting ' + JSON.stringify(query) + ' in ' + collection);
      return db.find(collection, query, options)
        .then(function (count) {
          return count;
        }.bind(this));
    },

    find: (query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug('finding ' + JSON.stringify(query) + ' in ' + collection);
      return db.find(collection, query, options)
        .then(function (dbCursor) {
          const cursor = new Cursor(dbCursor, function (item) {
            return _create(item, definition);
          });
          return (options.array) ? cursor.toArray() : cursor;
        });
    },

    findOne: (query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      options.findOne = true;
      const collection = definition.collection;
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

    update: (query, update, options) => {
      query = assign({}, definition.where, query);
      options = defaults(options, { autoSet: true });
      const collection = definition.collection;
      if (options.autoSet) {
        update = { $set: update };
      }
      delete options.autoSet;
      debug('updating ' + JSON.stringify(query) + ' from ' + collection);
      return db.update(collection, query, update, options);
    },

    remove: (query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug('removing ' + JSON.stringify(query) + ' from ' + collection);
      return db.remove(collection, query, options);
    },

    distinct: (key, query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug('finding distinct "' + key + '" ' + JSON.stringify(query) + ' from ' + collection);
      return db.distinct(collection, key, query, options);
    },

    aggregate: (pipeline, options) => {
      const collection = definition.collection;
      debug('aggregating ' + JSON.stringify(pipeline) + ' from ' + collection);
      return db.aggregate(collection, pipeline, options);
    },

    project: (query, value, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug('project ' + value + ', ' + JSON.stringify(query) + ' in ' + collection);
      return db.find(collection, query, options)
        .then(function (dbCursor) {
          dbCursor = dbCursor.project(value);
          return (options.array) ? dbCursor.toArray() : dbCursor;
        });
    }

  };

}

function _create (data, definition) {

  const _markAsModified = function (obj, paths, original) {
    paths.forEach(function(path) {
      if (Array.isArray(path)) {
        path = path.join('.');
      }
      let shouldAdd = true;
      obj.__modified = obj.__modified.filter(function (value) {
        shouldAdd = shouldAdd && path.indexOf(value + '.', 0) !== 0;
        return value.indexOf(path + '.', 0) !== 0;
      });
      if (shouldAdd) {
        obj.__modified.push(path);
      }
    });

    if('undefined' !== typeof(obj._id)){ // is not a new object
      obj.__original = original.toObject();
      if(obj.__original.__original){ obj.__original = obj.__original.__original; }
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
      for (let i = 0, l = this.__modified.length; i < l; i++) {
        let value = this.__modified[i];
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
    const original = this;
    return this.mutate(function () {
      let paths;
      if ('object' === typeof pathOrObj && !Array.isArray(pathOrObj)) {
        options = defaults(value, { silent: false });
        assign(this, pathOrObj);
        paths = Object.keys(pathOrObj);
      } else {
        options = defaults(options, { silent: false });
        objectPath.set(this, pathOrObj, value);
        paths = [pathOrObj];
      }

      if (!options.silent) {
        _markAsModified(this, paths, original);
      }
    });
  };

  definition.methods.del = function (path) {
    const original = this;
    return this.mutate(function () {
      objectPath.del(this, path);
      _markAsModified(this, [path], original);
    });
  };

  definition.methods.has = function (path) {
    return objectPath.has(this, path);
  };

  definition.methods.toJSON = function (options) {
    options = defaults(options, {
      virtuals: true,
      extended: true,
      exclude: undefined, // array of properties to exclude from the json object
      include: undefined, // array of white listed properties to include in the json object
      transform: undefined // function that accepts json object and returns a transformed version
    });
    function addVirtuals (def, obj) {
      if (def.type === 'array' && def.items && Array.isArray(obj)) {
        for (let i = 0, l = obj.length; i < l; i++) {
          addVirtuals(def.items, obj[i]);
        }
      }
      if (def.virtuals) {
        Object.keys(def.virtuals).forEach(function (name) {
          const val = def.virtuals[name].call(obj);
          obj[name] = val;
        }.bind(this));
      }
      if (def.properties) {
        Object.keys(obj).forEach(function (name) {
          if (!def.properties[name]) { return; }
          addVirtuals(def.properties[name], obj[name]);
        });
      }
    }
    let json = clone(this.toObject());
    delete json.__modified;
    delete json.__original;
    if (options.virtuals) {
      addVirtuals(definition, json);
    }
    if (options.extended) {
      json = EJSON.serialize(json);
    }
    json = _serialize(json);
    if (options.exclude) {
      options.exclude.forEach(function (prop) {
        delete json[prop];
      });
    } else if (options.include) {
      const newJson = {};
      options.include.forEach(function (prop) {
        newJson[prop] = json[prop];
      });
      json = newJson;
    }
    if (options.transform) {
      json = options.transform.call(null, json);
    }
    return json;
  };

  definition.methods.validate = function (options) {
    return this._validate(this.toObject(), options);
  };

  definition.methods._validate = function (obj, options) {
    const deferred = q.defer();
    options = defaults(options, {
      abortEarly: false,
      convert: false,
      allowUnknown: false,
      skipFunctions: true,
      stripUnknown: false,
    });
    joi.validate(obj, definition._schema, options, function (err, value) {
      if (err) {
        err = errors.Validation(err);
        return deferred.reject(err);
      }
      deferred.resolve(value);
    });
    return deferred.promise;
  };

  definition.methods.save = function (options) {
    if (!this.isNew() && !this.isModified()) {
      return q.resolve(this);
    }
    const obj = this.toObject();
    let before = q.resolve(obj);
    if ('function' === typeof this.beforeSave) {
      before = q.fcall(() => { return this.beforeSave.apply(obj); })
        .then(function () { return obj; });
    }
    return before
      .then(function (obj) {
        return this._validate(obj, options);
      }.bind(this))
      .then(function (value) {
        const obj = EJSON.serialize(value);
        const original = obj.__original;
        delete obj.__modified;
        delete obj.__original;
        const newEtag = etag(JSON.stringify(obj));
        const collection = definition.collection;
        if (!this.isNew()) {
          const query = { _id: obj._id, _etag: obj._etag };
          obj._etag = newEtag;
          debug('updating ' + collection + ': ' + JSON.stringify(obj));
          return db.update(collection, query, obj)
            .then(function (result) {
              if (result.matchedCount === 0) {
                throw errors.Conflict({ message: 'Document update conflict' });
              }
              debug('update into ' + collection + ' successful', result);
              const updatedModel = this.set({
                _etag: newEtag,
                __modified: [],
                __original: null
              }, { silent: true });
              if ('function' === typeof updatedModel.afterSave) {
                updatedModel.afterSave(original);
              }
              return updatedModel;
            }.bind(this));
        } else {
          obj._etag = newEtag;
          debug('inserting into ' + collection + ': ' + JSON.stringify(obj));
          return db.insert(collection, obj)
            .then(function (result) {
              debug('insert into ' + collection + ' successful', result);
              const obj = Array.isArray(result.ops) ? result.ops[0] : result.ops;
              const newModel = _create(obj, definition);
              if ('function' === typeof newModel.afterSave) {
                newModel.afterSave(null);
              }
              return newModel;
            }.bind(this));
        }
      }.bind(this));
  };

  definition.methods.remove = function () {
    const collection = definition.collection;
    const query = { _id: this._id, _etag: this._etag };
    const before = 'function' === typeof this.beforeRemove ?
      q.fcall(() => { return this.beforeRemove(); }) : q.resolve();
    return before.then(function () {
      debug('removing ' + JSON.stringify(query) + ' in ' + collection);
      return db.remove(collection, query)
        .then(function (result) {
          if (result.deletedCount === 0) {
            throw errors.Conflict({ message: 'Document remove conflict' });
          }
          debug('remove from ' + collection + ' successful');
          if ('function' === typeof this.afterRemove) {
            this.afterRemove();
          }
          return result;
        }.bind(this));
    }.bind(this));
  };

  return Immutable.create(data, { definition: definition });
}

function _extend (definition, superDef) {
  const newDef = clone(definition);
  if (!newDef.collection) {
    newDef.collection = superDef.collection;
  }
  newDef.properties = defaults(newDef.properties, superDef.properties || {});
  newDef.methods = defaults(newDef.methods, superDef.methods || {});
  newDef.virtuals = defaults(newDef.virtuals, superDef.virtuals || {});
  return define(newDef);
}

module.exports = {
  define: define
};

function _buildSchema (definition) {
  const schema = {};
  for (let p in definition.properties) {
    const propertyDef = definition.properties[p];
    if (propertyDef.type !== 'virtual') {
      schema[p] = _buildPropertySchema(p, propertyDef);
    }
  }
  return schema;
}

function _buildPropertySchema (name, propertyDef) {
  let schema = null;
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
        const keys = {};
        for (let p in propertyDef.properties) {
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
      break;
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

function _serializeArray (arr) {
  return arr.map(_serialize.bind(null));
}

function _serializeObject (obj) {
  const newObj = {};
  for (let p in obj) {
    newObj[p] = _serialize(obj[p]);
  }
  return newObj;
}

function _serialize (val) {
  if (val && 'function' === typeof val.toJSON) {
    return val.toJSON();
  } else if (Array.isArray(val)) {
    return _serializeArray(val);
  } else if (val === null || typeof(val) !== 'object') {
    return val;
  }
  return _serializeObject(val);
}

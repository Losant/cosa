const assign = require('object-assign');
const joi = require('@hapi/joi');
const etag = require('etag');
const debug = require('debug')('cosa:model');
const objectPath = require('object-path');
const defaults = require('defaults');
const clone = require('clone');
const EJSON = require('mongodb-extended-json');
const Cursor = require('./cursor');
const errors = require('./errors');
const { pathEq, complement, pathOr, pick, omit } = require('omnibelt');

const { buildPropertySchema } = require('./utils');

const Immutable = require('./immutable');
Immutable.use(require('./defined-object'));
Immutable.use('array', require('./array'));
Immutable.use(Date, require('./date'));
Immutable.use('objectid', require('./bson-objectId'));
Immutable.use(require('./object'));

const isNotVirtual = complement(pathEq([ 'type' ], 'virtual'));
const removeMeta = omit(['__modified', '__original']);
const onlyJoiOptions = pick(['abortEarly', 'convert', 'allowUnknown', 'skipFunctions', 'stripUnknown']);
const defaultJoiOptions = {
  abortEarly: false,
  convert: false,
  allowUnknown: false,
  skipFunctions: true,
  stripUnknown: false
};

const db = require('./db');
// functions that are defined later on.
let _serialize, _extend;

const addVirtuals = (def, obj) => {
  if (def.type === 'array' && def.items && Array.isArray(obj)) {
    for (let i = 0, l = obj.length; i < l; i++) {
      addVirtuals(def.items, obj[i]);
    }
  }
  if (def.virtuals) {
    Object.keys(def.virtuals).forEach((name) => {
      const val = def.virtuals[name].call(obj);
      obj[name] = val;
    });
  }
  if (def.properties) {
    Object.keys(obj).forEach((name) => {
      if (!def.properties[name]) { return; }
      addVirtuals(def.properties[name], obj[name]);
    });
  }
};

const _buildSchema = (definition) => {
  const schema = {};
  for (const p in definition.properties) {
    if (Object.prototype.hasOwnProperty.call(definition.properties, p)) {
      const propertyDef = definition.properties[p];
      if (isNotVirtual(propertyDef)) {
        schema[p] = buildPropertySchema(p, propertyDef);
      }
    }
  }
  return schema;
};

const _serializeObject = (obj) => {
  const newObj = {};
  for (const p in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, p)) {
      newObj[p] = _serialize(obj[p]);
    }
  }
  return newObj;
};

_serialize = (val) => {
  if (val && 'function' === typeof val.toJSON) {
    return val.toJSON();
  } else if (Array.isArray(val)) {
    return val.map(_serialize);
  } else if (val === null || typeof(val) !== 'object') {
    return val;
  }
  return _serializeObject(val);
};

const _markAsModified = function(obj, paths, original) {
  paths.forEach(function(path) {
    if (Array.isArray(path)) {
      path = path.join('.');
    }
    let shouldAdd = true;
    obj.__modified = obj.__modified.filter(function(value) {
      shouldAdd = shouldAdd && path.indexOf(`${value}.`, 0) !== 0;
      return value.indexOf(`${path}.`, 0) !== 0;
    });
    if (shouldAdd) {
      obj.__modified.push(path);
    }
  });

  if ('undefined' !== typeof(obj._id)) { // is not a new object
    obj.__original = original.toObject();
    if (obj.__original.__original) { obj.__original = obj.__original.__original; }
  }
};

const _create = (data, definition) => {

  definition.methods.is = function(obj) {
    if (this === obj) { return true; }
    if ('undefined' === typeof obj || obj === null) { return false; }
    if (this.__type !== obj.__type) { return false; }
    if (!this._id || !obj._id) { return false; }
    return this._id.toObject().toHexString() === obj._id.toObject().toHexString();
  };

  const _saveHelper = async function(context, options) {
    if (!context.isNew() && !context.isModified()) {
      return context;
    }
    let obj = context.toObject();
    if ('function' === typeof context.beforeSave) {
      await context.beforeSave.apply(obj);
    }
    obj = await context._validate(obj, options);
    const original = obj.__original;
    obj = removeMeta(obj);
    obj = EJSON.serialize(obj);
    const newEtag = etag(JSON.stringify(obj));
    const collection = definition.collection;
    let newOrUpdatedModel;
    if (!context.isNew()) {
      const query = { _id: obj._id, _etag: obj._etag };
      obj._etag = newEtag;
      debug(`updating ${collection}: ${JSON.stringify(obj)}`);
      const result = await db.replace(collection, query, obj);
      if (result.matchedCount === 0) {
        throw errors.Conflict({ message: 'Document update conflict' });
      }
      newOrUpdatedModel = context.set({
        _etag: newEtag,
        __modified: [],
        __original: null
      }, { silent: true });
    } else {
      obj._etag = newEtag;
      if (options.canPassID && options._id) { obj._id = options._id; }
      debug(`inserting into ${collection}: ${JSON.stringify(obj)}`);
      const result = await db.insert(collection, obj);
      debug(`insert into ${collection} successful`, result);
      obj = Array.isArray(result.ops) ? result.ops[0] : result.ops;
      newOrUpdatedModel = _create(obj, definition);
    }
    if ('function' === typeof newOrUpdatedModel.afterSave) {
      // should not be awaited
      const afterSave = newOrUpdatedModel.afterSave(original || null);
      if (pathOr(false, ['waitAfterSave'], options)) {
        await afterSave;
      }
    }
    return newOrUpdatedModel;
  };

  definition.methods.equals = function(obj) {
    if (this === obj) { return true; }
    return this.is(obj) && this._etag === obj._etag && !this.isModified() && !obj.isModified();
  };

  definition.methods.isNew = function() {
    return 'undefined' === typeof this._id;
  };

  definition.methods.isModified = function(path) {
    if (path) {
      if (Array.isArray(path)) {
        path = path.join('.');
      }
      for (let i = 0, l = this.__modified.length; i < l; i++) {
        const value = this.__modified[i];
        if (value === path || value.indexOf(`${path}.`, 0) === 0) {
          return true;
        }
      }
      return false;
    } else {
      return this.__modified.length > 0;
    }
  };

  definition.methods.get = function(path) {
    return objectPath.get(this, path);
  };

  definition.methods.set = function(pathOrObj, value, options) {
    const original = this;
    return this.mutate(function() {
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

  definition.methods.del = function(path) {
    const original = this;
    return this.mutate(function() {
      objectPath.del(this, path);
      _markAsModified(this, [path], original);
    });
  };

  definition.methods.has = function(path) {
    return objectPath.has(this, path);
  };

  definition.methods.toJSON = function(options) {
    // can only have include or exclude not both, should there be an error thrown if both are given?
    // probably not
    options = defaults(options, {
      virtuals: true,
      extended: true,
      exclude: undefined, // array of properties to exclude from the json object
      include: undefined, // array of white listed properties to include in the json object
      transform: undefined // function that accepts json object and returns a transformed version
    });
    // TODO move this out of here, there are no references to this, it's just mutation...recursive

    let json = removeMeta(this.toObject());
    json = clone(json); // not 100% sure we need to clone

    if (options.virtuals) {
      addVirtuals(definition, json);
    }
    if (options.extended) {
      json = EJSON.serialize(json);
    }
    json = _serialize(json);
    if (options.exclude) {
      json = omit(options.exclude, json);
    } else if (options.include) {
      json = pick(options.include, json);
    }
    if (options.transform) {
      json = options.transform.call(null, json);
    }
    return json;
  };

  definition.methods.validate = function(options) {
    return this._validate(this.toObject(), options);
  };

  definition.methods._validate = async function(obj, options = {}) {
    const joiOptions = defaults(onlyJoiOptions(options), defaultJoiOptions);
    try {
      return await joi.validate(obj, definition._schema, joiOptions);
    } catch (err) {
      throw errors.Validation(err);
    }
  };

  definition.methods.save = async function(options) {
    options = Object.assign(options || {}, { canPassID: false });
    return _saveHelper(this, options);
  };

  definition.methods.saveWithId = async function(id, options) {
    if (!this.isNew()) {
      throw new Error('saveWithId must receive a newly created object');
    }
    options = Object.assign(options || {}, { canPassID: true, _id: id });
    return _saveHelper(this, options);
  };

  definition.methods.remove = async function(options) {
    options = defaults(options, { waitAfterRemove: false });
    const collection = definition.collection;
    const query = { _id: this._id, _etag: this._etag };
    if ('function' === typeof this.beforeRemove) {
      await this.beforeRemove();
    }
    debug(`removing ${JSON.stringify(query)} in ${collection}`);
    const result = await db.remove(collection, query);
    if (result.deletedCount === 0) {
      throw errors.Conflict({ message: 'Document remove conflict' });
    }
    debug(`remove from ${collection} successful`);
    if ('function' === typeof this.afterRemove) {
      const afterRemove = this.afterRemove();
      if (options.waitAfterRemove) {
        await afterRemove;
      }
    }
    return result;
  };

  definition.methods.reload = async function() {
    const collection = definition.collection;
    const query = { _id: this._id };
    debug(`reloading ${this._id} in ${collection}`);
    const result = await db.find(collection, query, { findOne: true });
    return _create(result, definition);
  };

  return Immutable.create(data, { definition: definition });
};

/**
 * Static class for working with Models
 * @namespace Model
 */

/**
  *
  * @memberof Model
  * @param {Object} definition - the model in object form, properties, methods, virtuals
  * @returns {Object} an instance of Model
  */
const define = (definition) => {

  definition = defaults(definition, {
    properties: {},
    methods: {},
    virtuals: {}
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
      debug(`counting ${JSON.stringify(query)} in ${collection}`);
      return db.find(collection, query, options);
    },

    find: async (query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug(`finding ${JSON.stringify(query)} in ${collection}`);
      const dbCursor = await db.find(collection, query, options);
      const cursor = new Cursor(dbCursor, (item) => {
        return _create(item, definition);
      });
      return (options.array) ? cursor.toArray() : cursor;
    },

    findOne: async (query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      options.findOne = true;
      const collection = definition.collection;
      debug(`finding one${JSON.stringify(query)} in ${collection}`);
      const result = await db.find(collection, query, options);
      return !result ? null : _create(result, definition);
    },

    update: (query, update, options) => {
      query = assign({}, definition.where, query);
      options = defaults(options, { autoSet: true });
      const collection = definition.collection;
      if (options.autoSet) {
        update = { $set: update };
      }
      delete options.autoSet;
      debug(`updating ${JSON.stringify(query)} from ${collection}`);
      return db.update(collection, query, update, options);
    },

    remove: (query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug(`removing ${JSON.stringify(query)} from ${collection}`);
      return db.remove(collection, query, options);
    },

    distinct: (key, query, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug(`finding distinct "${key}" ${JSON.stringify(query)} from ${collection}`);
      return db.distinct(collection, key, query, options);
    },

    aggregate: (pipeline, options) => {
      const collection = definition.collection;
      debug(`aggregating ${JSON.stringify(pipeline)} from ${collection}`);
      return db.aggregate(collection, pipeline, options);
    },

    project: async (query, value, options) => {
      query = assign({}, definition.where, query);
      options = options || {};
      const collection = definition.collection;
      debug(`project ${value}, ${JSON.stringify(query)} in ${collection}`);
      let dbCursor = await db.find(collection, query, options);
      dbCursor = dbCursor.project(value);
      return (options.array) ? dbCursor.toArray() : dbCursor;
    }

  };

};

_extend = (definition, superDef) => {
  const newDef = clone(definition);
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

const joi = require('@hapi/joi');
const etag = require('etag');
const debug = require('debug')('cosa:model');
const objectPath = require('object-path');
const clone = require('clone');
const { EJSON } = require('bson');
const Cursor = require('./cursor');
const errors = require('./errors');
const { ObjectId } = require('bson');
const { pathEq, complement, pick, omit } = require('omnibelt');
const { buildPropertySchema } = require('./utils');
const Immutable = require('./immutable');
Immutable.use(require('./defined-object'));
Immutable.use('array', require('./array'));
Immutable.use(Date, require('./date'));
Immutable.use('objectid', require('./bson-objectId'));
Immutable.use(require('./object'));

const isNotVirtual = complement(pathEq([ 'type' ], 'virtual'));
const removeMeta = omit(['__modified', '__original']);

const db = require('./db');
const { createSession } = require('./session');
// functions that are defined later on.
let _serialize, _extend; // _useSession;

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
  return joi.object(schema);
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

  const _saveHelper = async function(context, options = {}, explicitId) {
    if (!context.isNew() && !context.isModified()) {
      return context;
    }
    let cosaSession;
    if (options.createSession) {
      cosaSession = await createSession();
      options.session = cosaSession;
      await cosaSession.startTransaction();
    }
    let obj = context.toObject();
    if ('function' === typeof context.beforeSave) {
      await context.beforeSave.apply(obj, [options]);
    }
    // TODO here if we get a validation error
    // and have a session should we abort the session?
    obj = await context._validate(obj, options);
    const original = obj.__original;
    obj = removeMeta(obj);
    const newEtag = etag(JSON.stringify(obj));
    const collection = definition.collection;
    let newOrUpdatedModel, result;
    if (!context.isNew()) {
      const query = { _id: obj._id, _etag: obj._etag };
      obj._etag = newEtag;
      debug(`updating ${collection}: ${JSON.stringify(obj)}`);
      try {
        result = await db.replace(collection, query, obj, options);
      } catch (e) {
        let error = e;
        if ((error.code === 11000 || error.message.startsWith('E11000 duplicate key')) && context.transformDuplicateKeyError) {
          error = context.transformDuplicateKeyError(error);
        }
        throw error;
      }
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
      if (explicitId) { obj._id = explicitId; }
      debug(`inserting into ${collection}: ${JSON.stringify(obj)}`);
      try {
        result = await db.insert(collection, obj, options);
      } catch (e) {
        let error = e;
        if ((error.code === 11000 || error.message.startsWith('E11000 duplicate key')) && context.transformDuplicateKeyError) {
          error = context.transformDuplicateKeyError(error);
        }
        throw error;
      }
      debug(`insert into ${collection} successful`, result);
      obj = Array.isArray(result.ops) ? result.ops[0] : result.ops;
      newOrUpdatedModel = _create(obj, definition);
    }
    if ('function' === typeof newOrUpdatedModel.afterSave) {
      // should not be awaited
      const afterSave = newOrUpdatedModel.afterSave(original || null, options);
      // when doing a session should we always just await this?
      if (options.waitAfterSave) { await afterSave; }
    }
    if ('function' === typeof newOrUpdatedModel.afterSaveCommit) {
      if (options.session) {
        options.session.afterCommits.push(newOrUpdatedModel.afterSaveCommit.bind(newOrUpdatedModel, original || null, options));
      } else {
        const afterCommit = newOrUpdatedModel.afterSaveCommit(original || null, options);
        if (options.waitAfterSave) { await afterCommit; }
      }
    }
    if (options.session && newOrUpdatedModel.saveAbort) {
      options.session.onAborts.push(newOrUpdatedModel.saveAbort.bind(newOrUpdatedModel));
    }
    if (options.createSession) {
      await cosaSession.commitTransaction();
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
        options = value;
        Object.assign(this, pathOrObj);
        paths = Object.keys(pathOrObj);
      } else {
        objectPath.set(this, pathOrObj, value);
        paths = [pathOrObj];
      }

      if (!options?.silent) {
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

  definition.methods.toJSON = function({ virtuals = true, extended = true, exclude, include, transform } = {}) {
    let json = removeMeta(this.toObject());
    json = clone(json); // not 100% sure we need to clone

    if (virtuals) {
      addVirtuals(definition, json);
    }
    if (extended) {
      json = EJSON.serialize(json);
    }
    json = _serialize(json);
    if (exclude) {
      json = omit(exclude, json);
    } else if (include) {
      json = pick(include, json);
    }
    if (transform) {
      json = transform(json);
    }
    return json;
  };

  definition.methods.validate = function(options) {
    return this._validate(this.toObject(), options);
  };

  definition.methods._validate = async function(obj, {
    abortEarly = false,
    convert = false,
    allowUnknown = false,
    skipFunctions = true,
    stripUnknown = false
  } = {} ) {
    try {
      return await definition._schema.validateAsync(obj, {
        abortEarly,
        convert,
        allowUnknown,
        skipFunctions,
        stripUnknown
      });
    } catch (err) {
      throw errors.Validation(err);
    }
  };

  definition.methods.save = async function(options) {
    return _saveHelper(this, options);
  };

  definition.methods.saveWithId = async function(id, options) {
    if (!this.isNew()) {
      throw new Error('saveWithId must receive a newly created object');
    }
    return _saveHelper(this, options, new ObjectId(id));
  };

  definition.methods.remove = async function(options = {}) {
    const collection = definition.collection;
    const query = { _id: this._id, _etag: this._etag };
    if ('function' === typeof this.beforeRemove) {
      await this.beforeRemove(options);
    }
    debug(`removing ${JSON.stringify(query)} in ${collection}`);
    const result = await db.remove(collection, query, options);
    if (result.deletedCount === 0) {
      throw errors.Conflict({ message: 'Document remove conflict' });
    }
    debug(`remove from ${collection} successful`);
    if ('function' === typeof this.afterRemove) {
      const afterRemove = this.afterRemove(options);
      if (options.waitAfterRemove) { await afterRemove; }
    }
    return result;
  };

  definition.methods.reload = async function(options = {}) {
    options.findOne = true;
    const collection = definition.collection;
    const query = { _id: this._id };
    debug(`reloading ${this._id} in ${collection}`);
    const result = await db.find(collection, query, options);
    return _create(result, definition);
  };

  return Immutable.create(data, { definition });
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

  definition = {
    properties: {},
    methods: {},
    virtuals: {},
    ...definition
  };

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

  const applyGlobalWhere = (query, options) => {
    return options.bypassGlobalWhere || !definition.where ?
      query : { ...definition.where, ...(query || {}) };
  };

  return {

    get __collectionName() { return definition.collection; },

    get __name() { return definition.name; },

    create: (data) => {
      return _create(data, definition);
    },

    extend: (subDefinition) => {
      return _extend(subDefinition, definition);
    },

    isA: (obj) => {
      return Immutable.isImmutableType(obj, definition.name || 'object');
    },

    count: (query, options = {}) => {
      query = applyGlobalWhere(query, options);
      const collection = definition.collection;
      debug(`counting ${JSON.stringify(query)} in ${collection}`);
      return db.find(collection, query, { ...options, count: true });
    },

    find: async (query, options = {}) => {
      query = applyGlobalWhere(query, options);
      const collection = definition.collection;
      debug(`finding ${JSON.stringify(query)} in ${collection}`);
      const dbCursor = await db.find(collection, query, options);
      const cursor = new Cursor(dbCursor, (item) => {
        return _create(item, definition);
      });
      return options.array ? cursor.toArray() : cursor;
    },

    findOne: async (query, options = {}) => {
      query = applyGlobalWhere(query, options);
      const collection = definition.collection;
      debug(`finding one${JSON.stringify(query)} in ${collection}`);
      const result = await db.find(collection, query, { ...options, findOne: true });
      return !result ? null : _create(result, definition);
    },

    update: (query, update, { autoSet = true, ...options } = {}) => {
      query = applyGlobalWhere(query, options);
      const collection = definition.collection;
      if (autoSet) {
        update = { $set: update };
      }
      debug(`updating ${JSON.stringify(query)} from ${collection}`);
      return db.update(collection, query, update, options);
    },

    remove: (query, options = {}) => {
      query = applyGlobalWhere(query, options);
      const collection = definition.collection;
      debug(`removing ${JSON.stringify(query)} from ${collection}`);
      return db.remove(collection, query, options);
    },

    distinct: (key, query, options = {}) => {
      query = applyGlobalWhere(query, options);
      const collection = definition.collection;
      debug(`finding distinct "${key}" ${JSON.stringify(query)} from ${collection}`);
      return db.distinct(collection, key, query, options);
    },

    aggregate: (pipeline, options = {}) => {
      const collection = definition.collection;
      debug(`aggregating ${JSON.stringify(pipeline)} from ${collection}`);
      return db.aggregate(collection, pipeline, options);
    },

    project: async (query, value, options = {}) => {
      query = applyGlobalWhere(query, options);
      const collection = definition.collection;
      debug(`project ${value}, ${JSON.stringify(query)} in ${collection}`);
      let dbCursor = await db.find(collection, query, options);
      dbCursor = dbCursor.project(value);
      return options.array ? dbCursor.toArray() : dbCursor;
    }

  };

};

_extend = (definition, superDef) => {
  const newDef = clone(definition);
  if (!newDef.collection) {
    newDef.collection = superDef.collection;
  }
  newDef.properties = { ...(superDef.properties || {}), ...(newDef.properties || {}) };
  newDef.methods = { ...(superDef.methods || {}), ...(newDef.methods || {}) };
  newDef.virtuals = { ...(superDef.virtuals || {}), ...(newDef.virtuals || {}) };
  return define(newDef);
};

module.exports = {
  define
};

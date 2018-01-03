var defaults = require('defaults');
var assign = require('object-assign');
var clone = require('clone');

var IMMUTABLE_TYPES = [ 'function', 'string', 'boolean', 'number', 'undefined' ];

var typeHandlers = [];

/**
 * Static class for working with immutable data types.
 * @static Immutable
 */
var Immutable = {

  /**
   * Registers an immutable handler for the given data type. Handlers are used 
   * to wrap specific data types. For example BSON ObjectIds or Dates.
   * @param {string} [type=*]
   * @param {function} handler
   */
  use: function (type, handler) {
    if (!handler) {
      handler = type;
      type = '*';
    }
    typeHandlers.push({
      type: type,
      handler: handler
    });
  },

  /**
   * Returns `true` if the given value is an Immutable.
   * @param {object} value
   * @returns {boolean}
   */
  isImmutable: function (value) {
    if ('undefined' === typeof value || value === null) { return true; }
    return (IMMUTABLE_TYPES.indexOf(typeof value) > -1 || !!value.__immutable);
  },

  /**
   * Returns `true` if the given value is an Immutable of the given type.
   * @param {object} value
   * @param {string} type
   * @returns {boolean}
   */
  isImmutableType: function (value, type) {
    return value && value.__immutable && value.__type.toLowerCase() === type.toLowerCase();
  },

  /**
   * Creates an immutable object based on the given data.
   * @param {object} data - Object to make immutable.
   * @param {object} [options] - Options passed to the immutable handler for the given data type.
   * @return {object}
   */
  create: function (data, options) {
    if (Immutable.isImmutable(data)) {
      return data;
    }

    options = defaults(options, {
      clone: true
    });

    if (options.clone) {
      data = clone(data);
    }

    var builder = new Builder('object', {});
    builder.defineProperty('__immutable', true, { enumerable: false });

    builder.defineMethod('toObject', function () {
      return data;
    });

    builder.defineMethod('mutate', function (cb) {
      var obj = clone(data);
      var newOptions = assign({}, options, { clone: false });
      cb.apply(obj);
      return Immutable.create(obj, newOptions);
    });

    typeHandlers.forEach(function (typeHandler) {
      if ('string' === typeof typeHandler.type) {
        if (typeHandler.type === '*' || typeof data === typeHandler.type) {
          return typeHandler.handler(data, builder, options);
        }
        if (typeHandler.type.toLowerCase() === 'array' && Array.isArray(data)) {
          return typeHandler.handler(data, builder, options);
        } else if (typeHandler.type.toLowerCase() === 'objectid' && data._bsontype === 'ObjectID') {
          return typeHandler.handler(data, builder, options);
        }
      } else if ('function' === typeof typeHandler.type && data instanceof typeHandler.type) {
        return typeHandler.handler(data, builder, options);
      }
    });

    builder.defineProperty('__type', builder.type, { enumerable: false });

    return Object.freeze(
      Object.create(Object.prototype, builder.props)
    );

  }

};

module.exports = Immutable;

var Builder = function (type, props) {
  this.type = type || 'object';
  this.props = props || {};

  this.defineProperty = function (name, getterOrValue, options) {
    options = defaults(options, { enumerable: true });
    options.get = ('function' === typeof getterOrValue) ?
      getterOrValue : function () { return Immutable.create(getterOrValue); };
    options.set = function () {
      throw new Error('Cannot modify ' + name + ' of immutable ' + this.type);
    };
    this.props[name] = options;
  };

  this.defineMethod = function (name, func, options) {
    options = defaults(options, { enumerable: false });
    options.value = func;
    this.props[name] = options;
  };

};

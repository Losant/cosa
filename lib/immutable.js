var defaults = require('defaults');
var assign = require('object-assign');
var clone = require('clone');

var IMMUTABLE_TYPES = [ 'function', 'string', 'boolean', 'number', 'undefined' ];

var typeHandlers = [];

var Immutable = {

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

  isImmutable: function (value) {
    if ('undefined' === typeof value) { return true; }
    return (IMMUTABLE_TYPES.indexOf(typeof value) > -1 || !!value.__immutable);
  },

  isImmutableType: function (value, type) {
    return value && value.__immutable && value.__type.toLowerCase() === type.toLowerCase();
  },

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
      return Immutable.create(obj, options);
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
      getterOrValue : function () { return Immutable.create(getterOrValue); }
    options.set = function () {
      throw new Error('Cannot modify ' + name + ' of immutable ' + this.type);
    }
    this.props[name] = options;
  };

  this.defineMethod = function (name, func, options) {
    options = defaults(options, { enumerable: false });
    options.value = func;
    this.props[name] = options;
  };

};

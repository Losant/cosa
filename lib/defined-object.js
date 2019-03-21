var Immutable = require('./immutable');

/**
 * Immutable handler used to create an immutable object based on definition 
 * describing the object properties and methods.
 * @name ImmutableDefinedObject
 * @param {object} data 
 * @param {object} builder 
 * @param {object} options
 * @param {object} options.definition
 * @param {object} [options.definition.properties] - Describes the properties of the immutable object.
 * @param {object} [options.definition.virtuals] - Describes the virtual properties of the immutable object.
 * @param {object} [options.definition.methods] - Describes the methods of the immutable object.
 */
module.exports = function (data, builder, options) {

  if (options.definition) {
    var definition = options.definition;
    if (definition.name) {
      builder.type = definition.name;
    }

    if (definition.properties) {
      Object.keys(definition.properties).forEach(function (prop) {
        var propertyDef = definition.properties[prop];
        var defaultVal = propertyDef.default;
        if ('undefined' === typeof data[prop] && 'undefined' !== typeof defaultVal) {
          data[prop] = 'function' === typeof defaultVal ? defaultVal.apply(data) : defaultVal;
        }
        var value = data[prop];
        var getter = function () {
          return (value = Immutable.create(value, { definition: propertyDef, clone: false }));
        };
        var options = {};
        if (propertyDef && 'undefined' !== typeof propertyDef.enumerable) {
          options.enumerable = propertyDef.enumerable;
        }
        builder.defineProperty(prop, getter, options);
      });
    }
    if (definition.virtuals) {
      Object.keys(definition.virtuals).forEach(function (virtual) {
        var virtualFunc = definition.virtuals[virtual];
        builder.defineProperty(virtual, function () {
          return Immutable.create(virtualFunc.call(data));
        });
      });
    }
    if (definition.methods) {
      Object.keys(definition.methods).forEach(function (method) {
        var methodFunc = definition.methods[method];
        builder.defineMethod(method, methodFunc);
      });
    }
  }

};

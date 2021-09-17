const Immutable = require('./immutable');

/**
 * Immutable handler used to create an immutable object based on definition
 * describing the object properties and methods.
 * @name ImmutableDefinedObject
 * @param {object} data - Underlying defined object
 * @param {object} builder - Builder instance
 * @param {object} options - Optional settings
 * @param {object} options.definition - Defintion settings
 * @param {object} [options.definition.properties] - Describes the properties of the immutable object.
 * @param {object} [options.definition.virtuals] - Describes the virtual properties of the immutable object.
 * @param {object} [options.definition.methods] - Describes the methods of the immutable object.
 * @returns {undefined} no return value
 */
module.exports = function(data, builder, options) {

  if (options.definition) {
    const definition = options.definition;
    if (definition.name) {
      builder.type = definition.name;
    }

    if (definition.properties) {
      Object.keys(definition.properties).forEach(function(prop) {
        const propertyDef = definition.properties[prop];
        const defaultVal = propertyDef.default;
        if ('undefined' === typeof data[prop] && 'undefined' !== typeof defaultVal) {
          data[prop] = 'function' === typeof defaultVal ? defaultVal.apply(data) : defaultVal;
        }
        let value = data[prop];
        const getter = function() {
          return (value = Immutable.create(value, { definition: propertyDef, clone: false }));
        };
        const getterOptions = {};
        if (propertyDef && 'undefined' !== typeof propertyDef.enumerable) {
          getterOptions.enumerable = propertyDef.enumerable;
        }
        builder.defineProperty(prop, getter, getterOptions);
      });
    }
    if (definition.virtuals) {
      Object.keys(definition.virtuals).forEach(function(virtual) {
        const virtualFunc = definition.virtuals[virtual];
        builder.defineProperty(virtual, function() {
          return Immutable.create(virtualFunc.call(data));
        });
      });
    }
    if (definition.methods) {
      Object.keys(definition.methods).forEach(function(method) {
        const methodFunc = definition.methods[method];
        builder.defineMethod(method, methodFunc);
      });
    }
  }

};

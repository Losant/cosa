import clone from 'clone';
import Immutable from './immutable.js';

/**
 * Immutable handler used to wrap a javascript array.
 * @name ImmutableArray
 * @param {object} data - Underlying array
 * @param {object} builder - Builder instance
 * @param {object} options - Optional settings
 * @returns {undefined} no return value
 */
export default function(data, builder, options) {
  builder.type = 'Array';

  builder.defineProperty('length', data.length);

  const itemDefinition = options?.definition?.items || {};
  const itemOptions = { definition: itemDefinition, clone: false };

  ['forEach', 'map', 'filter', 'some', 'every'].forEach(function(name) {
    builder.defineMethod(name, function(cb, thisArg) {
      const immuArr = Immutable.create(data, options);
      return Immutable.create(Array.prototype[name].call(data, function(val, index) {
        return cb.call(thisArg, Immutable.create(val, itemOptions), index, immuArr);
      }));
    });
  });

  ['reduce', 'reduceRight'].forEach(function(name) {
    builder.defineMethod(name, function(cb, initialValue) {
      const immuArr = Immutable.create(data, options);
      return Immutable.create(Array.prototype[name].call(data, function(prev, cur, index) {
        return cb(Immutable.create(prev), Immutable.create(cur, itemOptions), index, immuArr);
      }), initialValue);
    });
  });

  ['concat', 'join', 'slice', 'indexOf', 'lastIndexOf', 'reverse',
    'toString', 'toLocaleString'].forEach(function(name) {
    builder.defineMethod(name, function(...rest) {
      return Immutable.create(Array.prototype[name].apply(data, rest), options);
    });
  });

  builder.defineMethod('push', function(...rest) {
    return Immutable.create(Array.prototype.concat.apply(data, rest), options);
  });

  builder.defineMethod('unshift', function(...rest) {
    return Immutable.create(rest.concat(data), options);
  });

  builder.defineMethod('sort', function(cb) {
    const newArr = clone(data);
    if (!cb) {
      return Immutable.create(newArr.sort(), options);
    }
    return Immutable.create(newArr.sort(function(a, b) {
      return cb(Immutable.create(a, itemOptions), Immutable.create(b, itemOptions));
    }));
  });

  builder.defineMethod('splice', function(...rest) {
    const start = rest[0];
    const deleteCount = rest[1];
    const items = rest.slice(2) || [];
    const front = data.slice(0, start);
    const back = data.slice(start + deleteCount);
    return Immutable.create(front.concat(items, back), options);
  });

  builder.defineMethod('reverse', function() {
    const newArr = clone(data);
    return Immutable.create(newArr.reverse(), options);
  });
}

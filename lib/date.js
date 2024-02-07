import Immutable from './immutable.js';

/**
 * Immutable handler used to wrap javascript Dates.
 * @name ImmutableDate
 * @param {object} data - Underlying date
 * @param {object} builder - Builder instance
 * @param {object} options - Optional settings
 * @returns {undefined} no return value
 */
export default function(data, builder, options) {
  builder.type = 'Date';

  builder.defineMethod('mutate', function(cb) {
    const newDate = new Date(data.valueOf());
    cb.apply(newDate);
    return Immutable.create(newDate, { clone: false });
  });

  ['toString', 'toISOString', 'toUTCString', 'toDateString', 'toTimeString',
    'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'valueOf',
    'getTime', 'getFullYear', 'getUTCFullYear', 'toGMTString', 'getMonth',
    'getUTCMonth', 'getDate', 'getUTCDate', 'getDay', 'getUTCDay', 'getHours',
    'getUTCHours', 'getMinutes', 'getUTCMinutes', 'getSeconds', 'getUTCSeconds',
    'getMilliseconds', 'getUTCMilliseconds', 'getTimezoneOffset', 'getYear',
    'toJSON'].forEach(function(name) {
    builder.defineMethod(name, function(...rest) {
      return Date.prototype[name].apply(data, rest);
    });
  });

  ['setTime', 'setMilliseconds', 'setUTCMilliseconds', 'setSeconds',
    'setUTCSeconds', 'setMinutes', 'setUTCMinutes', 'setHours', 'setUTCHours',
    'setDate', 'setUTCDate', 'setMonth', 'setUTCMonth', 'setFullYear',
    'setUTCFullYear', 'setYear'].forEach(function(name) {
    builder.defineMethod(name, function(...rest) {
      const newDate = new Date(data.valueOf());
      newDate[name].apply(newDate, rest);
      return Immutable.create(newDate, options);
    });
  });

}

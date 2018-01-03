var q = require('q');

/**
 * Wrapper arround MongoDB Cursor to convert results to Models. 
 * @class
 * @param {object} cursor - MongoDB cursor object
 * @param {function} factory - Factory function used to create Models based on document from cursor.
 */
var Cursor = function (cursor, factory) {
  this._cursor = cursor;
  this._factory = factory;
};

/**
 * Iterates over cursor and executes the iterator for each model returned.
 * @param {function} iterator 
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#forEach}
 */
Cursor.prototype.forEach = function (iterator) {
  var deferred = q.defer();
  this._cursor.forEach(
    function (doc) {
      return iterator(this._factory(doc));
    }.bind(this),
    function (err) {
      if (err) { return deferred.reject(err); }
      deferred.resolve();
    }
  );
  return deferred.promise;
};

/**
 * Returns the count of documents on the cursor.
 * @param {boolean} applySkipLimit 
 * @param {object} options  
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#count}
 */
Cursor.prototype.count = function (applySkipLimit, options) {
  return this._cursor.count(applySkipLimit, options);
};

/**
 * Closed the underlying MongoDB cursor.
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#close}
 */
Cursor.prototype.close = function () {
  return this._cursor.close();
};

/**
 * Returns `true` if the cursor is closed.
 * @returns {boolean}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#isClosed}
 */
Cursor.prototype.isClosed = function () {
  return this._cursor.isClosed();
};

/**
 * Sets the cursor query filter.
 * @param {object} filter
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#filter}
 */
Cursor.prototype.filter = function (filter) {
  this._cursor.filter(filter);
  return this;
};

/**
 * Sets the cursor limit.
 * @param {number} limit
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#limit}
 */
Cursor.prototype.limit = function (limit) {
  this._cursor.limit(limit);
  return this;
};

/**
 * Maps cursor results using the provided function .
 * @param {function} transform
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#map}
 */
Cursor.prototype.map = function (transform) {
  return this._cursor.map(function (doc) {
    return transform(this._factory(doc));
  }.bind(this));
};

/**
 * Sets the cursor max.
 * @param {number} max
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#max}
 */
Cursor.prototype.max = function (max) {
  this._cursor.max(max);
  return this;
};

/**
 * Sets the cursor min.
 * @param {number} min
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#min}
 */
Cursor.prototype.min = function (min) {
  this._cursor.min(min);
  return this;
};

/**
 * Get the next available document from the cursor.
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#next}
 */
Cursor.prototype.next = function () {
  return this._cursor
    .next()
    .then(function (doc) {
      return this._factory(doc);
    }.bind(this));
};

/**
 * Like `Cursor.forEach` but guarantees non-parallel execution of iterator.
 * @param {function} iterator
 * @returns {Promise}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#forEach}
 */
Cursor.prototype.serialForEach = function (iterator) {
  var iterWrapper = function () {
    return this.next().then(function (item) {
      if(!item){ return; }
      return q(iterator(item)).then(iterWrapper);
    }.bind(this));
  }.bind(this);

  return iterWrapper();
};

/**
 * Sets the cursor skip.
 * @param {number} skip
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#skip}
 */
Cursor.prototype.skip = function (value) {
  this._cursor.skip(value);
  return this;
};

/**
 * Sets the cursor sort.
 * @param {number} sort
 * @returns {Cursor}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#sort}
 */
Cursor.prototype.sort = function (sortOrList, direction) {
  this._cursor.sort(sortOrList, direction);
  return this;
};

/**
 * Returns the cursor results as an array.
 * @returns {Array}
 * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#toArray}
 */
Cursor.prototype.toArray = function () {
  return this._cursor
    .toArray()
    .then(function (arr) {
      if (Array.isArray(arr)) {
        return arr.map(function (doc) {
          return this._factory(doc);
        }.bind(this));
      } else { return arr; }
    }.bind(this));
};

module.exports = Cursor;

/**
 * Wrapper around MongoDB Cursor to convert results to Models.
 * @class
 * @param {object} cursor - MongoDB cursor object
 * @param {function} factory - Factory function used to create Models based on document from cursor.
 */
class Cursor {
  constructor(cursor, factory) {
    this._cursor = cursor;
    this._factory = factory;
  }

  /**
   * Iterates over cursor and executes the iterator for each model returned.
   * @param {function} iterator
   * @returns {Promise}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#forEach}
   */
  async forEach(iterator) {
    return new Promise((resolve, reject) => {
      this._cursor.forEach(
        (doc) => { return iterator(this._factory(doc)); },
        (err) => {
          if (err) { return reject(err); }
          return resolve();
        });
    });
  }

  /**
   * Returns the count of documents on the cursor.
   * @param {boolean} applySkipLimit
   * @param {object} options
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#count}
   */
  count(applySkipLimit, options) {
    return this._cursor.count(applySkipLimit, options);
  }

  /**
   * Closed the underlying MongoDB cursor.
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#close}
   */
  close() {
    return this._cursor.close();
  }

  /**
   * Returns `true` if the cursor is closed.
   * @returns {boolean}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#isClosed}
   */
  isClosed() {
    return this._cursor.isClosed();
  }

  /**
   * Sets the cursor query filter.
   * @param {object} filter
   * @returns {Cursor}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#filter}
   */
  filter(filter) {
    this._cursor.filter(filter);
    return this;
  }

  /**
   * Sets the cursor limit.
   * @param {number} limit
   * @returns {Cursor}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#limit}
   */
  limit(limit) {
    this._cursor.limit(limit);
    return this;
  }

  /**
   * Maps cursor results using the provided function .
   * @param {function} transform
   * @returns {Cursor}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#map}
   */
  map(transform) {
    return this._cursor.map((doc) => {
      return transform(this._factory(doc));
    });
  }

  /**
   * Sets the cursor max.
   * @param {number} max
   * @returns {Cursor}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#max}
   */
  max(max) {
    this._cursor.max(max);
    return this;
  }

  /**
   * Sets the cursor min.
   * @param {number} min
   * @returns {Cursor}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#min}
   */
  min(min) {
    this._cursor.min(min);
    return this;
  }

  /**
   * Get the next available document from the cursor.
   * @returns {Promise}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#next}
   */
  async next() {
    const doc = await this._cursor.next();
    return this._factory(doc);
  }

  /**
   * Like `Cursor.forEach` but guarantees non-parallel execution of iterator.
   * @param {function} iterator
   * @returns {Promise}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#forEach}
   */
  serialForEach(iterator) {
    var itemWrapper = async () => {
      const item = await this.next();
      if (!item) { return; }
      await iterator(item);
      return itemWrapper();
    };
    return itemWrapper();
  }

  /**
   * Sets the cursor skip.
   * @param {number} skip
   * @returns {Cursor}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#skip}
   */
  skip(value) {
    this._cursor.skip(value);
    return this;
  }

  /**
   * Sets the cursor sort.
   * @param {number} sort
   * @returns {Cursor}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#sort}
   */
  sort(sortOrList, direction) {
    this._cursor.sort(sortOrList, direction);
    return this;
  }

  /**
   * Returns the cursor results as an array.
   * @returns {Array}
   * @see {@link http://mongodb.github.io/node-mongodb-native/3.0/api/Cursor.html#toArray}
   */
  async toArray() {
    const arr = await this._cursor.toArray();
    if (Array.isArray(arr)) {
      return arr.map((doc) => { return this._factory(doc); });
    }
    return arr;
  }
}

module.exports = Cursor;

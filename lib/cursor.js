import { times } from 'omnibelt';
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
   * @param {function} iterator - a function that will be called for each doc
   * @returns {Promise} - resolves when list is exhausted.
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#forEach}
   */
  async forEach(iterator) {
    return this._cursor.forEach((doc) => {
      return iterator(this._factory(doc));
    });
  }

  /**
   * Executes the iterator for the max number of items in parallel.
   * @param {number} maxParallel - the max number of items to run in parallel
   * @param {function} iterator - a function that will be called for each doc
   * @returns {Promise} - resolves when list is exhausted.
   */
  async forEachParallelLimitP(maxParallel, iterator) {
    if (!maxParallel || maxParallel < 1) { maxParallel = 1; }
    let cursorExhausted = false;
    const getNext = async () => {
      if (cursorExhausted) { return; }
      if (!await this._cursor.hasNext()) {
        cursorExhausted = true;
        return;
      }
      return this.next();
    };
    let nextResourceP = getNext();
    const itemWrapper = async () => {
      if (cursorExhausted) { return; }
      const currentResourceP = nextResourceP;
      nextResourceP = nextResourceP.then(getNext);
      const item = await currentResourceP;
      if (!item) { return; }
      await iterator(item);
      return itemWrapper();
    };
    const promises = times(itemWrapper, maxParallel);
    return Promise.all(promises);
  }

  /**
   * Returns the count of documents on the cursor.
   * @param {boolean} applySkipLimit - the number of docs to skip over in the count
   * @param {object} options - mongo cursor count options
   * @returns {number} the count of items in the list
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#count}
   */
  count(applySkipLimit, options) {
    return this._cursor.count(applySkipLimit, options);
  }

  /**
   * Close the underlying MongoDB cursor.
   * @returns {boolean} `true` if cursor is successfully closed
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#close-1}
   */
  close() {
    return this._cursor.close();
  }

  /**
   * Returns `true` if the cursor is closed.
   * @returns {boolean} `true` if the cursor is closed.
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#closed}
   */
  isClosed() {
    return this._cursor.closed;
  }

  /**
   * Sets the cursor query filter.
   * @param {object} filter - The filter object used for the cursor.
   * @returns {Cursor} the cursor instance
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#filter}
   */
  filter(filter) {
    this._cursor.filter(filter);
    return this;
  }

  /**
   * Sets the cursor limit.
   * @param {number} limit - A number to limit the cursor by.
   * @returns {Cursor} the cursor instance
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#limit}
   */
  limit(limit) {
    this._cursor.limit(limit);
    return this;
  }

  /**
   * Maps cursor results using the provided function.
   * @param {function} transform - A function that will be called by each document in the cursor.
   * @returns {Cursor} the cursor instance
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#map}
   */
  map(transform) {
    return this._cursor.map((doc) => {
      return transform(this._factory(doc));
    });
  }

  /**
   * Sets the cursor max.
   * @param {number} max - Specify a $max value to specify the exclusive upper bound for a specific index in order to constrain the results of find().
   * @returns {Cursor} the cursor instance
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#max}
   */
  max(max) {
    this._cursor.max(max);
    return this;
  }

  /**
   * Sets the cursor min.
   * @param {number} min - Specify a $min value to specify the inclusive lower bound for a specific index in order to constrain the results of find().
   * @returns {Cursor} the cursor instance
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#min}
   */
  min(min) {
    this._cursor.min(min);
    return this;
  }

  /**
   * Get the next available document from the cursor.
   * @returns {Promise} - resolves with the next document from the cursor.
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#next}
   */
  async next() {
    const doc = await this._cursor.next();
    return this._factory(doc);
  }

  /**
   * Like `Cursor.forEach` but guarantees non-parallel execution of iterator.
   * @param {function} iterator - the function that will be called by each document serially.
   * @returns {Promise} - resolves when each item in the cursor has been passed to the iterator function
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#forEach}
   */
  serialForEach(iterator) {
    const itemWrapper = async () => {
      const item = await this.next();
      if (!item) { return; }
      await iterator(item);
      return itemWrapper();
    };
    return itemWrapper();
  }

  /**
   * Sets the cursor skip.
   * @param {number} value - The skip for the cursor query.
   * @returns {Cursor} the cursor instance
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#skip}
   */
  skip(value) {
    this._cursor.skip(value);
    return this;
  }

  /**
   * Sets the cursor sort.
   * @param {string|Array} sortOrList The key or keys set for the sort.
   * @param {number} direction - `1` or `-1` for ascending or descending
   * @returns {Cursor} the cursor instance
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#sort}
   */
  sort(sortOrList, direction) {
    this._cursor.sort(sortOrList, direction);
    return this;
  }

  /**
   * Returns the cursor results as an array.
   * @returns {Promise} that resolves into an array from the cursor
   * @see {@link https://mongodb.github.io/node-mongodb-native/6.3/classes/FindCursor.html#toArray}
   */
  async toArray() {
    return this._cursor.map((doc) => { return this._factory(doc); }).toArray();
  }
}

export default Cursor;

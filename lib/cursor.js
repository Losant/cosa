var q = require('q');

var Cursor = function (cursor, factory) {
  this._cursor = cursor;
  this._factory = factory;
};

Cursor.prototype.forEach = function (iterator) {
  var deferred = q.defer();
  return this._cursor.forEach(
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

Cursor.prototype.count = function (applySkipLimit, options) {
  return this._cursor.count(applySkipLimit, options);
};

Cursor.prototype.close = function () {
  return this._cursor.close();
};

Cursor.prototype.isClosed = function () {
  return this._cursor.isClosed();
};

Cursor.prototype.filter = function (filter) {
  this._cursor.filter(filter);
  return this;
};

Cursor.prototype.limit = function (limit) {
  this._cursor.limit(limit);
  return this;
};

Cursor.prototype.map = function (transform) {
  return this._cursor.map(function (doc) {
    return transform(this._factory(doc));
  }.bind(this));
};

Cursor.prototype.max = function (max) {
  this._cursor.max(max);
  return this;
};

Cursor.prototype.min = function (min) {
  this._cursor.min(min);
  return this;
};

Cursor.prototype.next = function () {
  return this._cursor
    .next()
    .then(function (doc) {
      return this._factory(doc);
    }.bind(this));
};

Cursor.prototype.skip = function (value) {
  this._cursor.skip(value);
  return this;
};

Cursor.prototype.sort = function (sortOrList, direction) {
  this._cursor.sort(sortOrList, direction);
  return this;
};

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
}

module.exports = Cursor;

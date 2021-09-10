const chai = require('chai');
chai.use(require('chai-datetime'));
const expect = chai.expect;
const models = require('../lib/model');

describe('Immutable', function() {

  const Immutable = require('../lib/immutable');
  Immutable.use('array', require('../lib/array'));
  Immutable.use(Date, require('../lib/date'));
  Immutable.use(require('../lib/object'));

  const complexDef = {
    abstract: true,
    properties: {
      str: { type: 'string', default: 'abc' },
      num: { type: 'number', default: 0 },
      bool: { type: 'boolean', default: true },
      any: { type: 'any' },
      any2: { type: '*' },
      any3: {},
      allowNull: { type: 'string', min: 1, max: 255, allow: '', required: true },
      obj: {
        type: 'object',
        properties: {
          foo: { type: 'string' },
          bar: { type: 'string' }
        }
      },
      obj2: {
        type: 'object',
        properties: {
          bar: { type: 'string' }
        }
      },
      arr: { type: 'array' },
      date: { type: 'date', default: function() { return new Date(); } }
    },
    virtuals: {
      virt: function() {
        return `${this.str}.${this.num}`;
      }
    },
    methods: {
      foo: function() {
        return 'bar';
      }
    }
  };

  describe('.isImmutable()', function() {

    it('should return false for simple objects', function() {
      const obj = {}, arr = [], now = new Date();
      expect(Immutable.isImmutable(obj)).to.equal(false);
      expect(Immutable.isImmutable(arr)).to.equal(false);
      expect(Immutable.isImmutable(now)).to.equal(false);
    });

    it('should return true for native immutables', function() {
      const str = 'abc';
      const bool = true;
      const num = 5;
      const func = function() { };
      const u = undefined;
      expect(Immutable.isImmutable(str)).to.equal(true);
      expect(Immutable.isImmutable(bool)).to.equal(true);
      expect(Immutable.isImmutable(num)).to.equal(true);
      expect(Immutable.isImmutable(func)).to.equal(true);
      expect(Immutable.isImmutable(u)).to.equal(true);
    });

    it('should return true for immutable objects', function() {
      const obj = Immutable.create({ x: 0, y: 0 });
      const arr = Immutable.create(['a', 'b', 'c']);
      const now = Immutable.create(new Date());
      expect(Immutable.isImmutable(obj)).to.equal(true);
      expect(Immutable.isImmutable(arr)).to.equal(true);
      expect(Immutable.isImmutable(now)).to.equal(true);
    });

  });

  describe('.isImmutableType', function() {

    it('should return true for immutable arrays', function() {
      const arr = Immutable.create(['a', 'b', 'c']);
      expect(Immutable.isImmutableType(arr, 'array')).to.equal(true);
    });

    it('should return true for immutable date', function() {
      const date = Immutable.create(new Date());
      expect(Immutable.isImmutableType(date, 'date')).to.equal(true);
    });

    it('should return true for custom defined types', function() {
      const obj = Immutable.create({ x: 0, y: 0 }, { definition: { name: 'Point' } });
      expect(Immutable.isImmutableType(obj, 'Point')).to.equal(true);
    });

  });

  describe('.create()', function() {

    it('should return input value for native immutables', function() {
      const str = 'abc';
      const bool = true;
      const num = 5;
      const func = function() { };
      const u = undefined;
      expect(Immutable.create(str)).to.equal(str);
      expect(Immutable.create(bool)).to.equal(bool);
      expect(Immutable.create(num)).to.equal(num);
      expect(Immutable.create(func)).to.equal(func);
      expect(Immutable.create(u)).to.equal(u);
    });

    it('should return input value for immutable objects', function() {
      const obj = Immutable.create({ x: 0, y: 0 });
      const arr = Immutable.create(['a', 'b', 'c']);
      const now = Immutable.create(new Date());
      expect(Immutable.create(obj)).to.be.equal(obj);
      expect(Immutable.create(arr)).to.be.equal(arr);
      expect(Immutable.create(now)).to.be.equal(now);
    });

    it.only('should return an immutable defined by definition', async function() {
      const obj = Immutable.create({ obj: { foo: 'a' }, allowNull: '' }, { definition: complexDef });
      models.define(complexDef);
      // console.log(complexDef);
      // modelDef.create(obj).save();
      const result = await complexDef._schema.validateAsync(obj);
      expect(Immutable.isImmutable(obj)).to.equal(true);
      expect(obj.obj.foo).to.equal('a');
      expect(obj.str).to.equal('');
      expect(obj.num).to.equal(0);
      expect(obj.bool).to.equal(true);
      expect(Immutable.isImmutableType(obj.date, 'date')).to.equal(true);
      expect(obj.virt).to.equal('.0');
      expect(obj.foo()).to.equal('bar');
      expect(obj.allowNull).to.equal(null);
      const obj1 = Immutable.create({ obj: { foo: 'a' } }, { definition: complexDef });
    });

    it('should freeze object', function() {
      const obj = Immutable.create({ x: 0, y: 0 });
      obj.foo = 'bar';
      delete obj.x;
      expect(obj.foo).to.equal(undefined);
      expect(obj.x).to.equal(0);
    });

  });

  describe('.toObject()', function() {

    it('should return underlying object of immutables', function() {
      const obj = { x: 0, y: 0 };
      const immuObj = Immutable.create(obj);
      const arr = ['a', 'b', 'c'];
      const immuArr = Immutable.create(arr);
      const now = new Date();
      const immuDate = Immutable.create(now);
      expect(immuObj.toObject()).to.eql(obj);
      expect(immuArr.toObject()).to.eql(arr);
      expect(immuDate.toObject()).to.eql(now);
    });

  });

  describe('.mutate()', function() {

    it('should return a new immutable', function() {
      const obj = Immutable.create({ x: 0, y: 10 });
      const obj2 = obj.mutate(function() {
        this.x = this.y * 5;
        this.y = 100;
      });
      expect(Immutable.isImmutable(obj2)).to.equal(true);
      expect(obj2).to.not.equal(obj);
      expect(obj.x).to.equal(0);
      expect(obj.y).to.equal(10);
      expect(obj2.x).to.equal(50);
      expect(obj2.y).to.equal(100);
    });

  });

  describe('object accessors', function() {

    it('should return the property value', function() {
      const obj = Immutable.create({ x: 0, y: 0 });
      const arr = Immutable.create(['a', 'b', 'c']);
      expect(obj.x).to.equal(0);
      expect(arr[1]).to.equal('b');
    });

    it('should return immutable for nested objects', function() {
      const obj = Immutable.create({
        foo: { bar: 'a' }
      });
      const setFoo = function() { obj.foo.bar = 'blah'; };
      expect(Immutable.isImmutable(obj.foo)).to.equal(true);
      expect(setFoo).to.throw(Error);
      expect(obj.foo.bar).to.equal('a');
    });

  });

  describe('object mutators', function() {

    it('should throw error', function() {
      const obj = Immutable.create({ x: 0, y: 0 });
      const arr = Immutable.create(['a', 'b', 'c']);
      const setX = function() { obj.x = 10; };
      const setArr = function() { arr[1] = 'foo'; };
      expect(setX).to.throw(Error);
      expect(setArr).to.throw(Error);
    });

  });

  describe('array.length', function() {

    it('should return the length of the array', function() {
      const arr = Immutable.create(['a', 'b', 'c']);
      expect(arr.length).to.equal(3);
    });

  });

  describe('array accessors', function() {

    it('should access to array values', function() {
      const arr = Immutable.create(['a', 'b', 'c']);
      const arr2 = arr.concat([1, 2, 3]);
      expect(arr.join('.')).to.equal('a.b.c');
      expect(Immutable.isImmutableType(arr2, 'array')).to.equal(true);
      expect(arr2.toObject()).to.eql(['a', 'b', 'c', 1, 2, 3]);
    });

  });

  describe('array iterators', function() {

    it('should allow iterating array values', function() {
      const arr = Immutable.create(['a', 'b', 'c']);
      arr.forEach(function(e, i, a) {
        expect(Immutable.isImmutableType(a, 'array')).to.equal(true);
        expect(e).to.equal(arr[i]);
      });
      const arr2 = arr.filter(function(e) {
        return e === 'b';
      });
      expect(Immutable.isImmutableType(arr2, 'array')).to.equal(true);
      expect(arr2.toObject()).to.eql(['b']);
    });

  });

  describe('array reducers', function() {

    it('should reduce the array to a single value', function() {
      const arr = Immutable.create([0, 1, 2, 3, 4]);
      const val = arr.reduce(function(p, c, i, a) {
        expect(Immutable.isImmutableType(a, 'array')).to.equal(true);
        return p + c;
      });
      expect(val).to.equal(10);
    });

  });

  describe('array.push', function() {

    it('should return a new array with elements added to the end', function() {
      const arr = Immutable.create(['a', 'b', 'c']);
      const arr2 = arr.push(1, 2, 3);
      expect(Immutable.isImmutableType(arr2, 'array')).to.equal(true);
      expect(arr.length).to.equal(3);
      expect(arr2.length).to.equal(6);
      expect(arr2.toObject()).to.eql(['a', 'b', 'c', 1, 2, 3]);
    });

  });

  describe('array.unshift', function() {

    it('should return a new array with elements added to the beginning', function() {
      const arr = Immutable.create(['a', 'b', 'c']);
      const arr2 = arr.unshift(1, 2, 3);
      expect(Immutable.isImmutableType(arr2, 'array')).to.equal(true);
      expect(arr.length).to.equal(3);
      expect(arr2.length).to.equal(6);
      expect(arr2.toObject()).to.eql([1, 2, 3, 'a', 'b', 'c']);
    });

  });

  describe('array.sort', function() {

    it('should return a new sorted array', function() {
      const arr = Immutable.create([2, 1, 3]);
      const arr2 = arr.sort();
      const arr3 = arr.sort(function(a, b) {
        return b - a;
      });
      expect(Immutable.isImmutableType(arr2, 'array')).to.equal(true);
      expect(Immutable.isImmutableType(arr3, 'array')).to.equal(true);
      expect(arr.toObject()).to.eql([2, 1, 3]);
      expect(arr2.toObject()).to.eql([1, 2, 3]);
      expect(arr3.toObject()).to.eql([3, 2, 1]);
    });

  });

  describe('array.splice', function() {

    it('should return a new array with splice changes applied', function() {
      const arr = Immutable.create(['a', 'b', 'c']);
      const arr2 = arr.splice(2, 0, 'foo');
      const arr3 = arr.splice(0, 1);
      const arr4 = arr.splice(1, 1, 'blah', 'blah');
      expect(Immutable.isImmutableType(arr2, 'array')).to.equal(true);
      expect(Immutable.isImmutableType(arr3, 'array')).to.equal(true);
      expect(Immutable.isImmutableType(arr4, 'array')).to.equal(true);
      expect(arr.toObject()).to.eql(['a', 'b', 'c']);
      expect(arr2.toObject()).to.eql(['a', 'b', 'foo', 'c']);
      expect(arr3.toObject()).to.eql(['b', 'c']);
      expect(arr4.toObject()).to.eql(['a', 'blah', 'blah', 'c']);
    });

  });

  describe('array.reverse', function() {

    it('should sort the array', function() {
      const arr = Immutable.create([2, 1, 3]);
      const arr2 = arr.reverse();
      expect(Immutable.isImmutableType(arr2, 'array')).to.equal(true);
      expect(arr.toObject()).to.eql([2, 1, 3]);
      expect(arr2.toObject()).to.eql([3, 1, 2]);
    });

  });

  describe('date accessors', function() {

    it('should return the appropriate date values', function() {
      const date = Immutable.create(new Date(1976, 11, 18));
      expect(date.getMonth()).to.equal(11);
      expect(date.getFullYear()).to.equal(1976);
      expect(date.getDate()).to.equal(18);
    });

  });

  describe('date mutators', function() {

    it('should return an new immutable date', function() {
      const date = Immutable.create(new Date(1976, 11, 18));
      const date2 = date.setFullYear(2015);
      expect(Immutable.isImmutableType(date2, 'date')).to.equal(true);
      expect(date).to.not.equal(date2);
      expect(date.getFullYear()).to.equal(1976);
      expect(date2.getFullYear()).to.equal(2015);
    });

  });

});

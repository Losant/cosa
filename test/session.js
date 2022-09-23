const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-datetime'));
const expect = chai.expect;
const Model = require('../lib/model');
const { createSession } = require('../lib/session');
const cosaDb = require('../lib/db');
const { forEachSerialP } = require('omnibelt');

const callTracking = [];

const ModelB = Model.define({
  name: 'ModelB',
  collection: 'mochaB',
  properties: {
    strs: { type: 'array', max: 100, items: { type: 'string' }, default: [] }
  },
  methods: {
    afterSaveAbort: function() {
      callTracking.push(['afterSaveAbort', 'ModelB', this.strs.toObject().slice()]);
    },
    afterSave: async function() {
      callTracking.push(['afterSave', 'ModelB', this.strs.toObject().slice()]);
    },
    afterSaveCommit: function() {
      callTracking.push(['afterSaveCommit', 'ModelB', this.strs.toObject().slice()]);
    },
    afterRemoveAbort: function() {
      callTracking.push(['afterRemoveAbort', 'ModelB', this.strs.toObject().slice()]);
    },
    afterRemove: async function() {
      callTracking.push(['afterRemove', 'ModelB', this.strs.toObject().slice()]);
    },
    afterRemoveCommit: function() {
      callTracking.push(['afterRemoveCommit', 'ModelB', this.strs.toObject().slice()]);
    }
  }
});

const ModelA = Model.define({
  name: 'ModelA',
  collection: 'mochaA',
  properties: {
    str: { type: 'string', required: true }
  },
  methods: {
    afterSaveAbort: function() {
      callTracking.push(['afterSaveAbort', 'ModelA', this.str]);
    },
    afterSave: async function(original, saveOpts) {
      callTracking.push(['afterSave', 'ModelA', this.str]);
      const b = await ModelB.findOne({}, { session: saveOpts.session });
      if (b) {
        const strs = [...b.strs.toObject(), this.str];
        await b.set({ strs }).save(saveOpts);
      } else {
        await ModelB.create({ strs: [ this.str ] }).save(saveOpts);
      }
    },
    afterSaveCommit: function() {
      callTracking.push(['afterSaveCommit', 'ModelA', this.str]);
    },
    afterRemoveAbort: function() {
      callTracking.push(['afterRemoveAbort', 'ModelA', this.str]);
    },
    afterRemove: async function(saveOpts) {
      callTracking.push(['afterRemove', 'ModelA', this.str]);
      const b = await ModelB.findOne({ strs: this.str }, { session: saveOpts.session });
      if (b) {
        const strs = b.strs.toObject().filter((s) => s !== this.str);
        if (strs.length === 0) {
          await b.remove(saveOpts);
        } else {
          await b.set('strs', strs).save(saveOpts);
        }
      }
    },
    afterRemoveCommit: function() {
      callTracking.push(['afterRemoveCommit', 'ModelA', this.str]);
    }
  }
});

const ModelC = Model.define({
  name: 'ModelC',
  collection: 'mochaC',
  properties: {
    str: { type: 'string', required: true }
  },
  methods: {
    afterSaveAbort: function() {
      callTracking.push(['afterSaveAbort', 'ModelC', this.str]);
    },
    afterSave: async function() {
      callTracking.push(['afterSave', 'ModelC', this.str]);
    },
    afterSaveCommit: function() {
      callTracking.push(['afterSaveCommit', 'ModelC', this.str]);
    },
    afterRemoveAbort: function() {
      callTracking.push(['afterRemoveAbort', 'ModelC', this.str]);
    },
    afterRemove: async function() {
      callTracking.push(['afterRemove', 'ModelC', this.str]);
    },
    afterRemoveCommit: function() {
      callTracking.push(['afterRemoveCommit', 'ModelC', this.str]);
    }
  }
});

const ModelAError = Model.define({
  name: 'ModelAError',
  collection: 'mochaerror',
  properties: {
    str: { type: 'string', required: true }
  },
  methods: {
    afterSaveAbort: function() {
      callTracking.push(['afterSaveAbort', 'ModelAError', this.str]);
    },
    afterSave: async function(original, saveOpts) {
      callTracking.push(['afterSave', 'ModelAError', this.str]);
      const b = await ModelB.findOne({}, { session: saveOpts.session });
      if (b) {
        const strs = [...b.strs.toObject(), this.str];
        await b.set({ strs }).save(saveOpts);
      } else {
        await ModelB.create({ strs: [ this.str ] }).save(saveOpts);
      }
    },
    afterSaveCommit: async function() {
      callTracking.push(['afterSaveCommit', 'ModelAError', this.str]);
      throw new Error('Error after commit...');
    },
    afterRemoveAbort: function() {
      callTracking.push(['afterRemoveAbort', 'ModelAError', this.str]);
    },
    afterRemove: async function(saveOpts) {
      callTracking.push(['afterRemove', 'ModelAError', this.str]);
      const b = await ModelB.findOne({ strs: this.str }, { session: saveOpts.session });
      if (b) {
        const strs = b.strs.toObject().filter((s) => s !== this.str);
        if (strs.length === 0) {
          await b.remove(saveOpts);
        } else {
          await b.set('strs', strs).save(saveOpts);
        }
      }
    },
    afterRemoveCommit: function() {
      callTracking.push(['afterRemoveCommit', 'ModelAError', this.str]);
    }
  }
});

const cleanUpDb = async (client, db, close = true) => {
  const cursorCollection = await db.listCollections({});
  const collections = await cursorCollection.toArray();
  await Promise.all(collections.map(async ({ name }) => {
    const collection = db.collection(name);
    await collection.dropIndexes();
    return collection.deleteMany();
  }));
  if (close) { await client.close(); }
};


describe('Sessions', () => {
  before(async () => {
    await cosaDb.init();
    await forEachSerialP((colName) => {
      return cosaDb._db.createCollection(colName).catch((err) => {
        if (!err.message.includes('already exists')) {
          throw err;
        }
      });
    }, [ 'mochaA', 'mochaB', 'mochaC', 'mochaerror']);
  });

  after(async () => {
    if (cosaDb._client) {
      await cosaDb._client.close();
    }
  });

  afterEach(async () => {
    callTracking.length = 0;
    await cleanUpDb(cosaDb._client, cosaDb._db, false);
  });

  describe('onAbort', () => {
    it('one model, save', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelA.create({ str: 'hello' }).save({ session });
      expect(await ModelA.count({}, { session })).to.equal(1);
      expect(await ModelB.count({}, { session })).to.equal(1);
      await session.abortTransaction();
      expect(await ModelA.count()).to.equal(0);
      expect(await ModelB.count()).to.equal(0);
      expect(callTracking).to.eql([
        ['afterSave', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['hello']],
        ['afterSaveAbort', 'ModelB', ['hello']],
        ['afterSaveAbort', 'ModelA', 'hello']
      ]);
    });

    it('one model, remove', async () => {
      const orig = await ModelA.create({ str: 'hello' }).save({ waitAfterSave: true });

      const session = await createSession();
      await session.startTransaction();
      await orig.remove({ session });
      expect(await ModelA.count({}, { session })).to.equal(0);
      expect(await ModelB.count({}, { session })).to.equal(0);
      await session.abortTransaction();
      expect(await ModelA.count()).to.equal(1);
      expect(await ModelB.count()).to.equal(1);
      expect(callTracking).to.eql([
        ['afterSave', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelA', 'hello'],
        ['afterRemove', 'ModelA', 'hello'],
        ['afterRemove', 'ModelB', ['hello']],
        ['afterRemoveAbort', 'ModelB', ['hello']],
        ['afterRemoveAbort', 'ModelA', 'hello']
      ]);
    });

    it('multiple models, save', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelA.create({ str: 'hello' }).save({ session });
      await ModelA.create({ str: 'world' }).save({ session });
      expect(await ModelA.count({}, { session })).to.equal(2);
      expect(await ModelB.count({}, { session })).to.equal(1);
      await session.abortTransaction();
      expect(await ModelA.count()).to.equal(0);
      expect(await ModelB.count()).to.equal(0);

      expect(callTracking).to.eql([
        ['afterSave', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['hello']],
        ['afterSave', 'ModelA', 'world'],
        ['afterSave', 'ModelB', ['hello', 'world']],
        ['afterSaveAbort', 'ModelB', ['hello']],
        ['afterSaveAbort', 'ModelA', 'hello'],
        ['afterSaveAbort', 'ModelB', ['hello', 'world']],
        ['afterSaveAbort', 'ModelA', 'world']
      ]);
    });

    it('multiple models, remove', async () => {
      const one = await ModelA.create({ str: 'hello' }).save({ waitAfterSave: true });
      const two = await ModelA.create({ str: 'world' }).save({ waitAfterSave: true });

      const session = await createSession();
      await session.startTransaction();
      await one.remove({ session });
      await two.remove({ session });
      expect(await ModelA.count({}, { session })).to.equal(0);
      expect(await ModelB.count({}, { session })).to.equal(0);
      await session.abortTransaction();

      expect(await ModelA.count()).to.equal(2);
      expect(await ModelB.count()).to.equal(1);
      expect((await ModelB.findOne({})).strs.toObject()).to.eql(['hello', 'world']);

      expect(callTracking).to.eql([
        ['afterSave', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelA', 'hello'],
        ['afterSave', 'ModelA', 'world'],
        ['afterSave', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelA', 'world'],

        ['afterRemove', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['world']],
        ['afterRemove', 'ModelA', 'world'],
        ['afterRemove', 'ModelB', ['world']],
        ['afterSaveAbort', 'ModelB', ['world']],
        ['afterRemoveAbort', 'ModelA', 'hello'],
        ['afterRemoveAbort', 'ModelB', ['world']],
        ['afterRemoveAbort', 'ModelA', 'world']
      ]);
    });
  });

  describe('onCommit', () => {
    it('one model with invalid schema', async () => {
      const session = await createSession();
      await session.startTransaction();
      const error = await ModelC.create({}).save({ session }).catch((e) => e);
      expect(error.message).to.equal('"str" is required');
      await session.commitTransaction();
      expect(await ModelC.count()).to.equal(0);
    });

    it('multiple models, save', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelA.create({ str: 'hello' }).save({ session });
      await ModelA.create({ str: 'world' }).save({ session });
      await session.commitTransaction();
      expect(await ModelA.count()).to.equal(2);
      expect(await ModelB.count()).to.equal(1);

      expect(callTracking).to.eql([
        ['afterSave', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['hello']],
        ['afterSave', 'ModelA', 'world'],
        ['afterSave', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelA', 'hello'],
        ['afterSaveCommit', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelA', 'world']
      ]);
    });

    it('multiple models, remove', async () => {
      const one = await ModelA.create({ str: 'hello' }).save({ waitAfterSave: true });
      const two = await ModelA.create({ str: 'world' }).save({ waitAfterSave: true });

      const session = await createSession();
      await session.startTransaction();
      await one.remove({ session });
      await two.remove({ session });
      await session.commitTransaction();

      expect(await ModelA.count()).to.equal(0);
      expect(await ModelB.count()).to.equal(0);

      expect(callTracking).to.eql([
        ['afterSave', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelA', 'hello'],
        ['afterSave', 'ModelA', 'world'],
        ['afterSave', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelA', 'world'],

        ['afterRemove', 'ModelA', 'hello'],
        ['afterSave', 'ModelB', ['world']],
        ['afterRemove', 'ModelA', 'world'],
        ['afterRemove', 'ModelB', ['world']],
        ['afterSaveCommit', 'ModelB', ['world']],
        ['afterRemoveCommit', 'ModelA', 'hello'],
        ['afterRemoveCommit', 'ModelB', ['world']],
        ['afterRemoveCommit', 'ModelA', 'world']
      ]);
    });

    it('multiple models, after commit error', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelAError.create({ str: 'hello' }).save({ session });
      await ModelAError.create({ str: 'world' }).save({ session });
      const errors = await session.commitTransaction();
      expect(await ModelAError.count()).to.equal(2);
      expect(await ModelB.count()).to.equal(1);
      expect(errors.length).to.equal(2);
      expect(errors[0].message).to.equal('Error after commit...');
      expect(errors[1].message).to.equal('Error after commit...');

      expect(callTracking).to.eql([
        ['afterSave', 'ModelAError', 'hello'],
        ['afterSave', 'ModelB', ['hello']],
        ['afterSave', 'ModelAError', 'world'],
        ['afterSave', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelB', ['hello']],
        ['afterSaveCommit', 'ModelAError', 'hello'],
        ['afterSaveCommit', 'ModelB', ['hello', 'world']],
        ['afterSaveCommit', 'ModelAError', 'world']
      ]);
    });
  });
});

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-datetime'));
const expect = chai.expect;
const Model = require('../lib/model');
const { createSession } = require('../lib/session');
const cosaDb = require('../lib/db');
const { forEachSerialP } = require('omnibelt');

const globalSet = new Set();
const globalAfterSave = new Set();

const ModelB = Model.define({
  name: 'ModelB',
  collection: 'mochaB',
  properties: {
    strs: { type: 'array', max: 100, items: { type: 'string' } }
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
      globalSet.delete(this.str);
    },
    beforeSave: async function(saveOpts) {
      globalSet.add(this.str);
      const b = await ModelB.findOne({}, { session: saveOpts.session });
      if (b) {
        const strs = b.toObject().strs;
        strs.push(this.str);
        await b.set({ strs }).save(saveOpts);
      } else {
        await ModelB.create({ strs: [ this.str ] }).save(saveOpts);
      }
      return;
    },
    afterSaveCommit: function() {
      globalAfterSave.add(this.str);
    }
  }
});

const ModelC = Model.define({
  name: 'ModelC',
  collection: 'mochaC',
  properties: {
    str: { type: 'string', required: true }
  }
});

const ModelBAfterSaveCommitError = Model.define({
  name: 'ModelAError',
  collection: 'mochaerror',
  properties: {
    str: { type: 'string', required: true }
  },
  virtuals: {
    virt: function() {
      return `${this.str}.virtual`;
    }
  },
  methods: {
    beforeSave: async function(saveOpts) {
      const b = await ModelB.findOne({}, { session: saveOpts.session });
      if (b) {
        const strs = b.toObject().strs;
        strs.push(this.str);
        await b.set({ strs }).save(saveOpts);
      } else {
        await ModelB.create({ strs: [ this.str ] }).save(saveOpts);
      }
    },
    afterSaveCommit: async function() {
      throw new Error('Error before committee function...');
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
    await cleanUpDb(cosaDb._client, cosaDb._db, false);
  });

  describe('onAbort', () => {
    it('one model', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelA.create({ str: 'hello' }).save({ session });
      await session.abortTransaction();
      expect(await ModelA.count()).to.equal(0);
      expect(await ModelB.count()).to.equal(0);
    });

    it('multiple models', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelA.create({ str: 'hello' }).save({ session });
      await ModelA.create({ str: 'world' }).save({ session });
      expect(globalSet.has('hello')).to.equal(true);
      expect(globalSet.has('world')).to.equal(true);
      await session.abortTransaction();
      expect(globalSet.has('hello')).to.equal(false);
      expect(globalSet.has('world')).to.equal(false);
      expect(await ModelA.count()).to.equal(0);
      expect(await ModelB.count()).to.equal(0);
    });
  });

  describe('onCommitte', () => {
    it('one model with invalid schema', async () => {
      const session = await createSession();
      await session.startTransaction();
      const error = await ModelC.create({}).save({ session }).catch((e) => e);
      expect(error.message).to.equal('"str" is required');
      await session.commitTransaction();
      expect(await ModelC.count()).to.equal(0);
    });
    it('multiple models', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelA.create({ str: 'hello' }).save({ session });
      await ModelA.create({ str: 'world' }).save({ session });
      await session.commitTransaction();
      expect(await ModelA.count()).to.equal(2);
      expect(await ModelB.count()).to.equal(1);
      expect(Array.from(globalAfterSave)).to.deep.equal([ 'hello', 'world' ]);
    });

    it('multiple models', async () => {
      const session = await createSession();
      await session.startTransaction();
      await ModelBAfterSaveCommitError.create({ str: 'hello' }).save({ session });
      await ModelBAfterSaveCommitError.create({ str: 'world' }).save({ session });
      expect(globalSet.has('hello')).to.equal(true);
      expect(globalSet.has('world')).to.equal(true);
      const error = await session.commitTransaction().catch((e) => { return e; });
      expect(error.message).to.equal('Error before committee function...');
    });
  });
});

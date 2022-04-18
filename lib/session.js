const db = require('./db');
const { forEachSerialP } = require('omnibelt');

const createSession = async () => {
  const beforeCommits = [];
  const afterCommits = [];
  const onAborts = [];
  if (!db._client) {
    await db.init();
  }
  const session = await db._client.startSession();

  const abortTransaction = async (error) => {
    await forEachSerialP(async (afterAborted) => {
      await afterAborted(error);
    }, onAborts);
    await session.abortTransaction();
    await session.endSession();
  };
  
  return {
    get: () => {
      return session;
    },
    startTransaction: () => {
      return session.startTransaction();
    },
    commitTransaction: async () => {
      try {
        await forEachSerialP((beforeCommitFunc) => {
          return beforeCommitFunc({ session });
        }, beforeCommits);
      } catch (e) {
        await abortTransaction(e);
        throw e;
      }
      await session.commitTransaction();
      await session.endSession();
      await forEachSerialP((afterCommitFunc) => {
        return afterCommitFunc();
      }, afterCommits);
    },
    abortTransaction,
    beforeCommits,
    afterCommits,
    onAborts
  };
};

module.exports = {
  createSession
};
const db = require('./db');
const { forEachSerialP } = require('omnibelt');

const createSession = async () => {
  const afterCommits = [];
  const onAborts = [];
  if (!db._client) {
    await db.init();
  }
  const session = await db._client.startSession();

  const abortTransaction = async (error) => {
    await session.abortTransaction();
    await forEachSerialP(async (afterAborted) => {
      await afterAborted(error);
    }, onAborts);
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
      await session.commitTransaction();
      await session.endSession();
      await forEachSerialP((afterCommitFunc) => {
        return afterCommitFunc();
      }, afterCommits);
    },
    abortTransaction,
    afterCommits,
    onAborts
  };
};

module.exports = {
  createSession
};

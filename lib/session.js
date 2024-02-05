import db from './db.js';
import { forEachSerialP } from 'omnibelt';

export const createSession = async () => {
  const afterCommits = [];
  const afterAborts = [];
  if (!db._client) {
    await db.init();
  }
  const session = await db._client.startSession();

  const abortTransaction = async () => {
    const errors = [];
    await session.abortTransaction();
    await session.endSession();
    await forEachSerialP(async (afterAborted) => {
      try {
        await afterAborted();
      } catch (err) {
        errors.push(err);
      }
    }, afterAborts);
    return { errors };
  };

  return {
    get mongoSession() {
      return session;
    },
    startTransaction: () => {
      return session.startTransaction();
    },
    commitTransaction: async () => {
      const errors = [];
      await session.commitTransaction();
      await session.endSession();
      await forEachSerialP(async (afterCommitFunc) => {
        try {
          await afterCommitFunc();
        } catch (err) {
          errors.push(err);
        }
      }, afterCommits);
      return { errors };
    },
    abortTransaction,
    afterCommits,
    afterAborts
  };
};

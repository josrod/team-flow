/**
 * Mock service to simulate an internal API that provides task due dates.
 */
export const getTaskDueDate = async (taskId: number | string): Promise<string | undefined> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, 100);
  });
};
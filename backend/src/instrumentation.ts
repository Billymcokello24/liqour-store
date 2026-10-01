export const config = { runtime: "nodejs" };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.PUSH_WORKER_DISABLED === "1") return;
  const { startPushWorker } = await import("@/lib/push-worker");
  startPushWorker();
}

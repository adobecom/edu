export const analyticsEvents = [];

export async function sendAnalytics(name) {
  analyticsEvents.push(name);
}

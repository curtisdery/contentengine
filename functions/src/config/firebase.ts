import * as admin from "firebase-admin";

const app = admin.initializeApp();

export const db = admin.firestore(app);
export const auth = admin.auth(app);
export const storage = admin.storage(app);
export const messaging = admin.messaging(app);

export { admin };
export default app;

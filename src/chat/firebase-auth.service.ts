import { Injectable } from '@nestjs/common';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { customConfig } from 'src/config/config';

export interface VerifiedFirebaseVisitor {
  uid: string;
  email: string;
  name: string;
  photoUrl: string;
}

@Injectable()
export class FirebaseAuthService {
  private readonly auth: Auth | null;

  constructor() {
    const app = this.getOrCreateFirebaseApp();
    this.auth = app ? getAuth(app) : null;
  }

  async verifyVisitorToken(idToken: string): Promise<VerifiedFirebaseVisitor> {
    if (!this.auth) {
      throw new Error('Firebase admin credentials are not configured on the server.');
    }

    const decoded = await this.auth.verifyIdToken(idToken);

    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      name: decoded.name ?? '',
      photoUrl: decoded.picture ?? '',
    };
  }

  private getOrCreateFirebaseApp(): App | null {
    if (getApps().length) {
      return getApps()[0];
    }

    const config = customConfig();
    const projectId = config.FIREBASE_PROJECT_ID;
    const clientEmail = config.FIREBASE_CLIENT_EMAIL;
    const privateKey = config.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      return null;
    }

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}

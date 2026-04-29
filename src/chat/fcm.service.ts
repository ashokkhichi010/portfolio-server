import { Injectable, Logger } from '@nestjs/common';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { DeviceService } from 'src/devices/device.service';
import { FirebaseAuthService } from './firebase-auth.service';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly messaging: Messaging | null;

  constructor(
    private readonly firebaseAuthService: FirebaseAuthService,
    private readonly deviceService: DeviceService,
  ) {
    this.messaging = this.firebaseAuthService.getFirebaseApp()
      ? getMessaging(this.firebaseAuthService.getFirebaseApp()!)
      : null;
  }

  async sendNewLeadAlert(payload: { sessionId: string; visitorName: string; visitorEmail: string; status: string }) {
    if (!this.messaging) {
      this.logger.warn('Firebase Messaging skipped: admin app is not configured.');
      return;
    }

    const tokens = await this.deviceService.getActiveAdminTokens();
    if (!tokens.length) {
      return;
    }

    const body = payload.visitorName || payload.visitorEmail
      ? `${payload.visitorName || 'Verified visitor'} ${payload.visitorEmail ? `(${payload.visitorEmail})` : ''}`.trim()
      : 'A verified visitor requested a human handover.';

    const response = await this.messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: 'New Lead',
        body,
      },
      data: {
        sessionId: payload.sessionId,
        status: payload.status,
        type: 'handover_request',
      },
    });

    const invalidTokens = response.responses
      .map((item, index) => ({ item, token: tokens[index] }))
      .filter(({ item }) =>
        item.error?.code === 'messaging/invalid-registration-token' ||
        item.error?.code === 'messaging/registration-token-not-registered',
      )
      .map(({ token }) => token);

    await this.deviceService.deactivateTokens(invalidTokens);
  }

  async sendVisitorMessageAlert(payload: {
    ownerId: string;
    title: string;
    body: string;
    sessionId: string;
    status: string;
    type: string;
  }) {
    if (!this.messaging) {
      return;
    }

    const tokens = await this.deviceService.getActiveVisitorTokens(payload.ownerId);
    if (!tokens.length) {
      return;
    }

    const response = await this.messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        sessionId: payload.sessionId,
        status: payload.status,
        type: payload.type,
      },
    });

    const invalidTokens = response.responses
      .map((item, index) => ({ item, token: tokens[index] }))
      .filter(({ item }) =>
        item.error?.code === 'messaging/invalid-registration-token' ||
        item.error?.code === 'messaging/registration-token-not-registered',
      )
      .map(({ token }) => token);

    await this.deviceService.deactivateTokens(invalidTokens);
  }
}

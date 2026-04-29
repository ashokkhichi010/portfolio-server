# Portfolio Server

NestJS backend for a real-time portfolio chat system with AI-first conversations, visitor-to-admin handover, admin 2FA, MongoDB persistence, and Firebase push notifications.

## Features

- Socket.io chat gateway with anonymous visitor session bootstrapping
- MongoDB + Mongoose schemas for users, tokens, OTPs, sessions, devices, conversations, messages, and notifications
- OpenAI chat completions with `offer_handover` function calling
- Admin email/password login followed by OTP verification
- Firebase Admin integration for visitor identity verification and FCM delivery
- Handover timer management through `Map<string, NodeJS.Timeout>` in `ChatService`

## Project Structure

```text
src/
  common/enums
  modules/
    ai/
    auth/
    chat/
    notifications/
```

## Required Environment Variables

Create a `.env` file in the project root.

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/portfolio-server

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

JWT_SECRET=replace_this_in_production
JWT_EXPIRES_IN=15m

FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Optional Environment Variables

```env
ADMIN_OTP_EMAIL_FROM=no-reply@example.com
FCM_DEFAULT_SOUND=default
HANDOVER_TIMEOUT_MS=60000
```

## Installation

```bash
npm install
```

## Run

```bash
npm run start:dev
```

## Admin Auth Flow

### `POST /auth/admin/login`

Request:

```json
{
  "email": "admin@example.com",
  "password": "plain-text-password"
}
```

Response:

```json
{
  "otpToken": "uuid",
  "expiresAt": "2026-04-28T18:30:00.000Z",
  "requires2fa": true
}
```

### `POST /auth/admin/verify`

Request:

```json
{
  "otpToken": "uuid",
  "otp": "123456"
}
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "refresh-token",
  "user": {
    "id": "mongo-id",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

## WebSocket Events

### Visitor events

- `visitor_message`
- `request_handover`

### Server emits

- `session_created`
- `ai_message`
- `AI_OFFER_HANDOVER`
- `handover_requested`
- `ADMIN_BUSY`
- `admin_joined_chat`

### Admin events

- `admin_join_chat`

## Notes

- OTP email sending is stubbed with a logger in `AuthService`; replace it with your email provider.
- Refresh tokens, OTPs, and passwords are stored hashed.
- Firebase visitor verification expects a client Firebase ID token.
- FCM notifications are skipped when Firebase Admin is not initialized.

## Validation

After installing dependencies, validate with:

```bash
npm run build
npm run test
```

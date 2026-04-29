export const customConfig = () => ({
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
  APP_URL: process.env.APP_URL,
  DASHBOARD_URL: process.env.DASHBOARD_URL,
  TOKEN_TYPES: {
    ACCESS: 'access',
    REFRESH: 'refresh',
    RESET_PASSWORD: 'resetPassword',
    VERIFY_EMAIL: 'verifyEmail',
    VERIFY_INVITE_EMAIL: 'verifyInviteEmail',
  },

  JWT: {
    SECRET: process.env.JWT_SECRET,
    ACCESS_EXPIRATION_MINUTES: process.env.JWT_ACCESS_EXPIRATION_MINUTES,
    REFRESH_EXPIRATION_DAYS: process.env.JWT_REFRESH_EXPIRATION_DAYS,
    RESET_PASSWORD_EXPIRATION_MINUTES: process.env.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    VERIFY_EMAIL_EXPIRATION_MINUTES: process.env.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },

  SMTP: {
    HOST: process.env.SMTP_HOST,
    PORT: process.env.SMTP_PORT,
    USERNAME: process.env.SMTP_USERNAME,
    PASSWORD: process.env.SMTP_PASSWORD,
    EMAIL_FROM: process.env.EMAIL_FROM,
  },

  BCRYPT_SALT: 10,

  OTP_EXPIRES_MINUTES: 10,
});
import * as dotenv from 'dotenv';
dotenv.config();

export type ConfigType = {
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASS: string;
  DB_NAME: string;
  ACCESS_TOKEN_KEY: string;
  ACCESS_TOKEN_TIME: string;
  REFRESH_TOKEN_KEY: string;
  REFRESH_TOKEN_TIME: string;
  JWT_SECRET: string;
  REDIS_HOST: string;
  REDIS_PORT: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_APP_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_APP_SECRET: string;
  FACEBOOK_CLIENT_ID: string;
  FACEBOOK_APP_SECRET: string;
  FRONTEND_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
};

export const config: ConfigType = {
  PORT: Number(process.env.PORT),
  DB_HOST: process.env.DB_HOST as string,
  DB_PORT: Number(process.env.DB_PORT),
  DB_USER: process.env.DB_USER as string,
  DB_PASS: process.env.DB_PASS as string,
  DB_NAME: process.env.DB_NAME as string,
  ACCESS_TOKEN_KEY: process.env.ACCESS_TOKEN_KEY as string,
  ACCESS_TOKEN_TIME: process.env.ACCESS_TOKEN_TIME as string,
  REFRESH_TOKEN_KEY: process.env.REFRESH_TOKEN_KEY as string,
  REFRESH_TOKEN_TIME: process.env.REFRESH_TOKEN_TIME as string,
  JWT_SECRET: process.env.JWT_SECRET as string,
  REDIS_HOST: process.env.REDIS_HOST as string,
  REDIS_PORT: process.env.REDIS_PORT as string,
  SMTP_HOST: process.env.SMTP_HOST as string,
  SMTP_PORT: process.env.SMTP_PORT as string,
  SMTP_USER: process.env.SMTP_USER as string,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD as string,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID as string,
  GOOGLE_APP_SECRET: process.env.GOOGLE_APP_SECRET as string,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID as string,
  GITHUB_APP_SECRET: process.env.GITHUB_APP_SECRET as string,
  FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID as string,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET as string,
  FRONTEND_URL: process.env.FRONTEND_URL as string,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME as string,
};

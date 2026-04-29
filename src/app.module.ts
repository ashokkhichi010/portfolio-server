import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { DeviceModule } from './devices/device.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => process.env] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ global: true, secret: process.env.JWT_SECRET }),
        MongooseModule.forRoot(new ConfigService().getOrThrow("MONGODB_URI")),
        AuthModule,
        DeviceModule,
        ChatModule,
    ],
    controllers: [],
    providers: [
    ],
})
export class AppModule { }

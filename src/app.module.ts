import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ChatModule } from './chat/chat.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => process.env] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ global: true, secret: process.env.JWT_SECRET }),
        MongooseModule.forRoot(new ConfigService().getOrThrow("MONGODB_URI")),
        ChatModule,
    ],
    controllers: [],
    providers: [
    ],
})
export class AppModule { }

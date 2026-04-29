import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { Device, deviceCollection, deviceSchema } from './entities/device.entity';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Device.name, schema: deviceSchema, collection: deviceCollection }]),
  ],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}

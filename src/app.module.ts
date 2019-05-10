import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { ResourceService } from './resource/resource.service';
import { ConfigService } from './config/config.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, DatabaseService, ResourceService, ConfigService],
})
export class AppModule {}

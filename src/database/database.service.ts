import { Injectable } from '@nestjs/common';
import { createConnection } from 'typeorm';

@Injectable()
export class DatabaseService {
  constructor() {
    createConnection();
  }
}
